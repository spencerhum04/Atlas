/**
 * TTS audio playback with gapless scheduling.
 *
 * Framework-agnostic service class. Receives raw Int16 PCM chunks at 48kHz
 * (native Gradium TTS output rate) and schedules them for gapless playback
 * using the Web Audio API.
 *
 * Each chunk: 7680 bytes = 3840 samples = 80ms at 48kHz.
 */

export class AudioPlaybackService {
  private audioContext: AudioContext | null = null;
  private nextStartTime = 0;
  private scheduledSources: AudioBufferSourceNode[] = [];

  start(): void {
    this.audioContext = new AudioContext({ sampleRate: 48000 });
    this.nextStartTime = 0;
  }

  /**
   * Decode an Int16 PCM chunk and schedule it for gapless playback.
   * @param pcmBytes Raw Int16 PCM ArrayBuffer (48kHz, mono)
   */
  playChunk(pcmBytes: ArrayBuffer): void {
    if (!this.audioContext) return;

    const int16 = new Int16Array(pcmBytes);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i]! / 32768;
    }

    const buffer = this.audioContext.createBuffer(
      1,
      float32.length,
      this.audioContext.sampleRate,
    );
    buffer.copyToChannel(float32, 0);

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.audioContext.destination);

    // Gapless scheduling: each buffer starts exactly when the previous ends
    const now = this.audioContext.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }
    source.start(this.nextStartTime);
    this.nextStartTime += buffer.duration;

    this.scheduledSources.push(source);
    source.onended = () => {
      const idx = this.scheduledSources.indexOf(source);
      if (idx !== -1) this.scheduledSources.splice(idx, 1);
    };
  }

  /** Whether audio is currently scheduled/playing. */
  get isPlaying(): boolean {
    return this.scheduledSources.length > 0;
  }

  /** Stop all playback immediately (e.g. user starts talking, interrupts guide). */
  interrupt(): void {
    for (const source of this.scheduledSources) {
      try {
        source.stop();
      } catch {
        // Already stopped
      }
    }
    this.scheduledSources = [];
    this.nextStartTime = 0;
  }

  stop(): void {
    this.interrupt();
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
