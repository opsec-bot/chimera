// Lightweight soundNotifications module replacing legacy script.
// Exposes window.soundNotifications with: testSound(kind), playDataReceived(), playPaymentSuccess(), setVolume(v), setSoundPreference(enabled), setDataSoundCooldown(ms)

type SoundKind = 'dataReceived' | 'paymentSuccess';

class SoundNotifications {
  private audioMap: Record<string, HTMLAudioElement | null> = {};
  private enabled = true;
  private volume = 1;
  private cooldown = 2000;
  private lastDataAt = 0;

  constructor() {
    this.audioMap['dataReceived'] = this.createAudio('/sounds/data-received.mp3');
    this.audioMap['paymentSuccess'] = this.createAudio('/sounds/payment-success.mp3');
  }

  private createAudio(src: string) {
    try {
      const a = new Audio(src);
      a.preload = 'auto';
      a.volume = this.volume;
      return a;
    } catch (e) {
      return null;
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    Object.values(this.audioMap).forEach((a) => {
      if (a) a.volume = this.volume;
    });
  }

  setSoundPreference(enabled: boolean) {
    this.enabled = Boolean(enabled);
  }

  setDataSoundCooldown(ms: number) {
    this.cooldown = Math.max(0, Number(ms) || 0);
  }

  async play(kind: SoundKind) {
    if (!this.enabled) return;
    const now = Date.now();
    if (kind === 'dataReceived' && now - this.lastDataAt < this.cooldown) return;
    if (kind === 'dataReceived') this.lastDataAt = now;

    const a = this.audioMap[kind];
    if (a) {
      try {
        // clone for concurrent play
        const clone = a.cloneNode(true) as HTMLAudioElement;
        clone.volume = this.volume;
        await clone.play().catch(() => {});
        return;
      } catch (e) {
        // fallback to WebAudio beep
      }
    }

    // WebAudio fallback
    try {
      const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext) as any;
      const ctx = new AudioCtx();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      if (kind === 'dataReceived') {
        o.type = 'sine';
        o.frequency.value = 880;
        g.gain.value = 0.0001;
        o.start();
        g.gain.exponentialRampToValueAtTime(0.5, ctx.currentTime + 0.01);
        setTimeout(() => {
          try {
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
            o.stop();
            ctx.close();
          } catch (e) {}
        }, 200);
      } else {
        o.type = 'triangle';
        o.frequency.value = 440;
        g.gain.value = 0.0001;
        o.start();
        g.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.01);
        setTimeout(() => {
          try {
            g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
            o.stop();
            ctx.close();
          } catch (e) {}
        }, 300);
      }
    } catch (e) {
      // give up silently
    }
  }

  testSound(kind: SoundKind) {
    this.play(kind);
  }

  playDataReceived() {
    this.play('dataReceived');
  }

  playPaymentSuccess() {
    this.play('paymentSuccess');
  }
}

const instance = new SoundNotifications();

// attach to window for backward compatibility
try {
  (window as any).soundNotifications = instance;
} catch (e) {}

export default instance;
