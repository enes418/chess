export type SoundType = 'move' | 'capture' | 'castle' | 'check' | 'gameOver' | 'puzzleWin' | 'puzzleFail';

class SoundEffects {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private getContext(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public play(type: SoundType): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    try {
      switch (type) {
        case 'move': {
          this.tone(ctx, 190, 120, 0.055, 'triangle', 0.14, now);
          break;
        }
        case 'capture': {
          this.tone(ctx, 290, 95, 0.08, 'sawtooth', 0.16, now);
          this.tone(ctx, 140, 70, 0.06, 'sine', 0.12, now + 0.01);
          break;
        }
        case 'castle': {
          this.tone(ctx, 200, 130, 0.05, 'triangle', 0.13, now);
          this.tone(ctx, 240, 150, 0.05, 'triangle', 0.13, now + 0.07);
          break;
        }
        case 'check': {
          this.tone(ctx, 560, 420, 0.13, 'sine', 0.18, now);
          this.tone(ctx, 840, 620, 0.1, 'triangle', 0.08, now + 0.02);
          break;
        }
        case 'gameOver': {
          this.tone(ctx, 440, 440, 0.14, 'triangle', 0.14, now);
          this.tone(ctx, 554.37, 554.37, 0.14, 'triangle', 0.14, now + 0.11);
          this.tone(ctx, 659.25, 659.25, 0.28, 'triangle', 0.16, now + 0.22);
          break;
        }
        case 'puzzleWin': {
          this.tone(ctx, 523.25, 523.25, 0.1, 'sine', 0.14, now);
          this.tone(ctx, 659.25, 659.25, 0.18, 'sine', 0.16, now + 0.09);
          break;
        }
        case 'puzzleFail': {
          this.tone(ctx, 240, 175, 0.16, 'sawtooth', 0.11, now);
          break;
        }
      }
    } catch {
      // Ignore audio errors on restricted browsers
    }
  }

  private tone(
    ctx: AudioContext,
    startFreq: number,
    endFreq: number,
    duration: number,
    wave: OscillatorType,
    gainPeak: number,
    startTime: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(startFreq, startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), startTime + duration);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(gainPeak, startTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}

export const soundFX = new SoundEffects();
