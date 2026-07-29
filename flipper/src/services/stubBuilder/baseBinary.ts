import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { spawn } from 'child_process';
import { Logger } from '../../utils/logger';
import { StubBuildQueue } from '../buildQueue';

/**
 * Owns the single pre-built base stub binary that the inject hot path
 * (services/stubBuilder/inject.ts) patches per user request.
 *
 * Lifecycle:
 *   - On boot: ensureFresh() hashes the template tree and rebuilds the base
 *     iff the hash changed (or the binary is missing). The build is gated by
 *     StubBuildQueue so it can't collide with concurrent user requests if
 *     anything ever falls back to a live compile.
 *   - On the hot path: callers use pathIfReady() and accept that "not ready"
 *     is a soft error surfaced through the existing build-status flow.
 *
 * Cargo's target dir is kept across rebuilds at temp/stub_base/target so the
 * cold rebuild is incremental.
 */
export class BaseBinary {
  private static readonly TEMPLATE_PATH = path.join(process.cwd(), 'templates', 'stub');
  private static readonly BASE_DIR = path.join(process.cwd(), 'temp', 'stub_base');
  private static readonly BASE_BIN = path.join(BaseBinary.BASE_DIR, 'stub.exe');
  private static readonly HASH_FILE = path.join(BaseBinary.BASE_DIR, '.template_hash');
  private static readonly BUILD_DIR = path.join(BaseBinary.BASE_DIR, 'build_workdir');
  private static readonly TARGET_DIR = path.join(BaseBinary.BASE_DIR, 'target');

  private static ensurePromise: Promise<string> | null = null;

  public static async ensureFresh(): Promise<string> {
    this.ensurePromise ??= (async (): Promise<string> => {
      try {
        return await this.ensureFreshInner();
      } finally {
        this.ensurePromise = null;
      }
    })();
    return this.ensurePromise;
  }

  public static async pathIfReady(): Promise<string | null> {
    try {
      await fs.access(this.BASE_BIN);
      return this.BASE_BIN;
    } catch {
      return null;
    }
  }

  private static async ensureFreshInner(): Promise<string> {
    await fs.mkdir(this.BASE_DIR, { recursive: true });

    const currentHash = await this.computeTemplateHash();
    const storedHash = await readIfExists(this.HASH_FILE);
    const baseExists = await exists(this.BASE_BIN);

    if (baseExists && storedHash?.trim() === currentHash) {
      Logger.info('Base binary up to date', {
        hash: currentHash.slice(0, 12),
        path: this.BASE_BIN,
      });
      return this.BASE_BIN;
    }

    Logger.info('Base binary stale or missing; rebuilding', {
      have: storedHash?.slice(0, 12) ?? '(none)',
      want: currentHash.slice(0, 12),
    });

    const reservation = StubBuildQueue.tryReserve();
    if ('full' in reservation) {
      throw new Error('Build queue at capacity while priming base binary');
    }

    await reservation.run(() => this.compileBase());
    await fs.writeFile(this.HASH_FILE, currentHash);
    Logger.info('Base binary built', { path: this.BASE_BIN });
    return this.BASE_BIN;
  }

  /**
   * Stable content hash over the template tree (skipping target/, build/,
   * .git). Filenames are included so renames/deletes invalidate too.
   */
  private static async computeTemplateHash(): Promise<string> {
    const h = crypto.createHash('sha256');
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const e of entries) {
        if (e.name === 'target' || e.name === 'build' || e.name === '.git') continue;
        const full = path.join(dir, e.name);
        const rel = path.relative(this.TEMPLATE_PATH, full).replace(/\\/g, '/');
        if (e.isDirectory()) {
          h.update(`D ${rel}\n`);
          await walk(full);
        } else {
          const data = await fs.readFile(full);
          h.update(`F ${rel} ${data.length}\n`);
          h.update(data);
        }
      }
    };
    await walk(this.TEMPLATE_PATH);
    return h.digest('hex');
  }

  private static async compileBase(): Promise<void> {
    // Fresh workdir each build so a previously failed run can't leave a
    // mutated resources.rc / icon.ico behind. The shared CARGO_TARGET_DIR
    // keeps incremental compilation working across rebuilds.
    await fs.rm(this.BUILD_DIR, { recursive: true, force: true });
    await fs.mkdir(this.BUILD_DIR, { recursive: true });
    await copyDir(this.TEMPLATE_PATH, this.BUILD_DIR);

    // %BASE_URL% is server config, not per-user, so we still bake it in at
    // base-build time. %ACCESS_KEY% is gone — KEY_BLOB handles it.
    const { config } = await import('../../config/config');
    const baseUrl = config.baseUrl ?? '';
    const mainRsPath = path.join(this.BUILD_DIR, 'src', 'main.rs');
    const src = await fs.readFile(mainRsPath, 'utf8');
    if (src.includes('%ACCESS_KEY%')) {
      throw new Error(
        '%ACCESS_KEY% placeholder still present in main.rs; expected KEY_BLOB after refactor',
      );
    }
    await fs.writeFile(mainRsPath, src.replace(/%BASE_URL%/g, baseUrl));

    await runBaseBuild(this.BUILD_DIR, this.TARGET_DIR);

    const built = path.join(this.TARGET_DIR, 'release', 'stub.exe');
    await fs.copyFile(built, this.BASE_BIN);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readIfExists(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8');
  } catch {
    return null;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    if (e.name === 'target') continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(s, d);
    } else {
      await fs.copyFile(s, d);
    }
  }
}

async function runBaseBuild(cwd: string, targetDir: string): Promise<void> {
  // Match the toolchain assumptions already in StubBuilderService: MSVC 2022
  // Community + the make.bat that builds the encrypted C++ DLL. sig.py is
  // intentionally not invoked — signing was dropped from the pipeline.
  const vcvars =
    'C:\\Program Files\\Microsoft Visual Studio\\2022\\Community\\VC\\Auxiliary\\Build\\vcvars64.bat';
  const script = [
    '@echo off',
    'setlocal',
    `call "${vcvars}" || exit /b %errorlevel%`,
    'if not exist build mkdir build',
    // build_asm.bat (invoked by build.rs) writes target\syscall_trampoline.obj
    // relative to the crate cwd, even though cargo's actual target dir is
    // redirected via CARGO_TARGET_DIR. Pre-create the dir so ML64 has
    // somewhere to put the .obj.
    'if not exist target mkdir target',
    'call make.bat || exit /b %errorlevel%',
    'cargo build --release || exit /b %errorlevel%',
    'endlocal',
  ].join('\r\n');
  const scriptPath = path.join(cwd, '__base_build.bat');
  await fs.writeFile(scriptPath, script);

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('cmd', ['/c', '__base_build.bat'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, CARGO_TARGET_DIR: targetDir },
      shell: false,
    });
    let stderr = '';
    proc.stdout?.on('data', (d) => Logger.info(`[base build] ${String(d).trim()}`));
    proc.stderr?.on('data', (d) => {
      const s = String(d);
      stderr += s;
      Logger.warn(`[base build] ${s.trim()}`);
    });
    const timer = setTimeout(
      () => {
        proc.kill('SIGKILL');
        reject(new Error('Base build timed out'));
      },
      15 * 60 * 1000,
    );
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`Base build exited ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}
