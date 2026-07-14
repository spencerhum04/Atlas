/**
 * Background music playback with crossfade support.
 *
 * Uses HTML5 <audio> elements (completely separate from the Web Audio API
 * used for TTS in AudioPlaybackService). Two audio elements enable smooth
 * crossfading between tracks.
 *
 * Singleton — import `musicService` and call methods directly.
 */

const DEFAULT_VOLUME = 0.25;
const DEFAULT_FADE_MS = 2000;
const FADE_INTERVAL_MS = 50;

class MusicService {
  private current: HTMLAudioElement | null = null;
  private fading: HTMLAudioElement | null = null;
  private _volume = DEFAULT_VOLUME;
  private fadeTimer: number | null = null;

  /** Start playing a track. */
  play(
    url: string,
    opts?: { loop?: boolean; fadeInMs?: number },
  ): void {
    const { loop = true, fadeInMs = DEFAULT_FADE_MS } = opts ?? {};

    // Stop any existing playback
    this.stopImmediate();

    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = 0;
    this.current = audio;

    audio.play().then(() => {
      this.fadeIn(audio, fadeInMs);
    }).catch((err) => {
      console.warn("[Music] Play failed (user interaction required?):", err);
    });
  }

  /** Crossfade from current track to a new one. */
  crossfadeTo(
    url: string,
    durationMs: number = DEFAULT_FADE_MS,
    opts?: { loop?: boolean },
  ): void {
    const { loop = true } = opts ?? {};

    // Move current to fading slot
    if (this.fading) {
      this.fading.pause();
      this.fading = null;
    }
    this.fading = this.current;
    this.current = null;

    // Clear any existing fade timer
    if (this.fadeTimer != null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }

    // Create new audio element
    const audio = new Audio(url);
    audio.loop = loop;
    audio.volume = 0;
    this.current = audio;

    audio.onerror = () => {
      console.error("[Music] Crossfade audio load error:", audio.error?.message, "src:", url.slice(0, 80));
    };

    const fadingOut = this.fading;
    const fadingOutStartVol = fadingOut?.volume ?? 0;
    const steps = Math.max(1, Math.floor(durationMs / FADE_INTERVAL_MS));
    let step = 0;

    audio.play().then(() => {
      console.log("[Music] Crossfade playing:", url.slice(0, 80));
      this.fadeTimer = window.setInterval(() => {
        step++;
        const progress = Math.min(1, step / steps);

        // Fade in new track
        audio.volume = progress * this._volume;

        // Fade out old track
        if (fadingOut) {
          fadingOut.volume = Math.max(0, fadingOutStartVol * (1 - progress));
        }

        if (progress >= 1) {
          if (this.fadeTimer != null) {
            clearInterval(this.fadeTimer);
            this.fadeTimer = null;
          }
          if (fadingOut) {
            fadingOut.pause();
            if (this.fading === fadingOut) {
              this.fading = null;
            }
          }
        }
      }, FADE_INTERVAL_MS);
    }).catch((err) => {
      console.warn("[Music] Crossfade play failed:", err);
    });
  }

  /** Stop playback with optional fade out. */
  stop(fadeOutMs: number = DEFAULT_FADE_MS): void {
    if (this.fadeTimer != null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }

    // Stop fading track immediately
    if (this.fading) {
      this.fading.pause();
      this.fading = null;
    }

    if (!this.current) return;

    const audio = this.current;
    const startVol = audio.volume;
    const steps = Math.max(1, Math.floor(fadeOutMs / FADE_INTERVAL_MS));
    let step = 0;

    this.fadeTimer = window.setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);
      audio.volume = Math.max(0, startVol * (1 - progress));

      if (progress >= 1) {
        if (this.fadeTimer != null) {
          clearInterval(this.fadeTimer);
          this.fadeTimer = null;
        }
        audio.pause();
        if (this.current === audio) {
          this.current = null;
        }
      }
    }, FADE_INTERVAL_MS);
  }

  /** Set target volume (0-1). Affects current track immediately. */
  setVolume(v: number): void {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.current) {
      this.current.volume = this._volume;
    }
  }

  get volume(): number {
    return this._volume;
  }

  get isPlaying(): boolean {
    return this.current != null && !this.current.paused;
  }

  private fadeIn(audio: HTMLAudioElement, durationMs: number): void {
    const steps = Math.max(1, Math.floor(durationMs / FADE_INTERVAL_MS));
    let step = 0;

    this.fadeTimer = window.setInterval(() => {
      step++;
      const progress = Math.min(1, step / steps);
      audio.volume = progress * this._volume;

      if (progress >= 1) {
        if (this.fadeTimer != null) {
          clearInterval(this.fadeTimer);
          this.fadeTimer = null;
        }
      }
    }, FADE_INTERVAL_MS);
  }

  private stopImmediate(): void {
    if (this.fadeTimer != null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
    if (this.current) {
      this.current.pause();
      this.current = null;
    }
    if (this.fading) {
      this.fading.pause();
      this.fading = null;
    }
  }
}

export const musicService = new MusicService();
