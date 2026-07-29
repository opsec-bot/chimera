import os from 'os';
import { Logger } from '../utils/logger';

/**
 * Bounded worker queue for stub builds.
 *
 * Two-phase API so we can reject early with backpressure:
 *   1. tryReserve() — synchronous capacity check. Returns a Reservation or a
 *      retry-after hint if the queue is full. Reserving counts against
 *      capacity immediately so concurrent reservations don't over-admit.
 *   2. reservation.run(fn) — waits for an actual worker slot to open, then
 *      runs fn. Releases the worker slot and the reservation when fn settles.
 *
 * Sizing: defaults to half the CPU count for the worker pool (cargo + linker
 * are CPU-heavy and parallelize internally), with a small backlog of waiters
 * on top. Both knobs are env-overridable so this is easy to tune on the box.
 */
export class QueueFullError extends Error {
  public readonly retryAfterSec: number;
  constructor(retryAfterSec: number) {
    super('Build queue at capacity');
    this.name = 'QueueFullError';
    this.retryAfterSec = retryAfterSec;
  }
}

export interface QueueStats {
  inFlight: number;
  queued: number;
  reserved: number;
  maxConcurrent: number;
  maxQueueDepth: number;
}

export class BuildQueue {
  private inFlight = 0;
  /** reservations not yet running (includes inFlight + waiting). */
  private reserved = 0;
  private readonly waiters: Array<() => void> = [];

  /** average build duration used for Retry-After estimation, in seconds. */
  private avgBuildSec = 60;

  constructor(
    public readonly maxConcurrent: number,
    public readonly maxQueueDepth: number,
  ) {}

  get stats(): QueueStats {
    return {
      inFlight: this.inFlight,
      queued: this.waiters.length,
      reserved: this.reserved,
      maxConcurrent: this.maxConcurrent,
      maxQueueDepth: this.maxQueueDepth,
    };
  }

  /**
   * Attempt to take a slot. Synchronous so callers can fail fast with 503
   * before doing any DB work.
   */
  public tryReserve(): Reservation | { full: true; retryAfterSec: number } {
    const capacity = this.maxConcurrent + this.maxQueueDepth;
    if (this.reserved >= capacity) {
      return { full: true, retryAfterSec: this.estimateRetryAfterSec() };
    }
    this.reserved += 1;
    return new Reservation(this);
  }

  /** Internal: waiter parks here until a worker slot opens. */
  /* package */ acquireWorker(): Promise<void> {
    if (this.inFlight < this.maxConcurrent) {
      this.inFlight += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.inFlight += 1;
        resolve();
      });
    });
  }

  /* package */ releaseWorker(): void {
    this.inFlight -= 1;
    const next = this.waiters.shift();
    if (next) next();
  }

  /* package */ releaseReservation(): void {
    this.reserved -= 1;
  }

  /* package */ recordDuration(seconds: number): void {
    // simple EMA so a few unusually slow builds don't dominate the estimate.
    this.avgBuildSec = this.avgBuildSec * 0.8 + seconds * 0.2;
  }

  private estimateRetryAfterSec(): number {
    const ahead = Math.max(0, this.reserved - this.maxConcurrent) + 1;
    const est = Math.ceil((ahead / this.maxConcurrent) * this.avgBuildSec);
    return Math.max(5, Math.min(300, est));
  }
}

export class Reservation {
  private released = false;
  constructor(private readonly queue: BuildQueue) {}

  /**
   * Run fn inside a worker slot. The reservation is consumed either way.
   * Safe to call exactly once.
   */
  public async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.released) throw new Error('Reservation already used');
    const start = Date.now();
    await this.queue.acquireWorker();
    try {
      return await fn();
    } finally {
      this.queue.releaseWorker();
      this.released = true;
      this.queue.releaseReservation();
      this.queue.recordDuration((Date.now() - start) / 1000);
    }
  }

  /**
   * Drop the reservation without running anything (e.g. caller errored before
   * scheduling the work).
   */
  public cancel(): void {
    if (this.released) return;
    this.released = true;
    this.queue.releaseReservation();
  }
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULT_WORKERS = Math.max(1, Math.floor(os.cpus().length / 2));
const DEFAULT_QUEUE_DEPTH = 2;

/**
 * Process-wide queue for the cargo build path. Sized small on purpose — these
 * jobs are CPU + disk heavy and oversubscription is what we're fixing.
 */
export const StubBuildQueue = new BuildQueue(
  parsePositiveInt(process.env.STUB_BUILD_WORKERS, DEFAULT_WORKERS),
  parsePositiveInt(process.env.STUB_BUILD_QUEUE_DEPTH, DEFAULT_QUEUE_DEPTH),
);

Logger.info('Stub build queue initialized', {
  maxConcurrent: StubBuildQueue.maxConcurrent,
  maxQueueDepth: StubBuildQueue.maxQueueDepth,
});
