/**
 * Mic capture via AudioWorklet.
 *
 * Framework-agnostic service class. Captures microphone audio at the system's
 * native sample rate, downsamples to 24kHz inside the AudioWorklet (linear
 * interpolation), and delivers Int16 PCM chunks via callback.
 *
 * Output: 1920 samples per chunk (80ms at 24kHz = 3840 bytes).
 */

export class AudioCaptureService {
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;

  /**
   * Request mic permission, start capture, and call onChunk for each PCM chunk.
   * @param onChunk Called with raw Int16 PCM ArrayBuffer (3840 bytes = 1920 samples @ 24kHz)
   * @param onVoiceActivity Called when the AudioWorklet detects voice energy above threshold
   * @param onMicLevel Called at ~20Hz with current RMS level for waveform visualization
   */
  async start(
    onChunk: (pcmBytes: ArrayBuffer) => void,
    onVoiceActivity?: () => void,
    onMicLevel?: (rms: number) => void,
  ): Promise<void> {
    // Use the system's default sample rate — the AudioWorklet will downsample
    // to 24kHz internally. This avoids the "different sample-rate" DOMException
    // when connecting a MediaStreamSource to a non-native-rate AudioContext.
    this.audioContext = new AudioContext();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    // Resume if suspended (autoplay policy)
    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.audioContext.audioWorklet.addModule("/audio-processor.js");

    this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "audio-capture-processor",
    );

    this.workletNode.port.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        onChunk(event.data);
      } else if (event.data?.type === "voice_activity" && onVoiceActivity) {
        onVoiceActivity();
      } else if (event.data?.type === "mic_level" && onMicLevel) {
        onMicLevel(event.data.rms as number);
      }
    };

    // Connect: mic source → worklet → destination (must be connected to keep processing)
    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.audioContext.destination);
  }

  /** Mute/unmute mic at the track level. Muted track produces silence frames
   *  so the AudioWorklet keeps running and STT VAD still receives audio. */
  setMuted(muted: boolean): void {
    if (this.stream) {
      for (const track of this.stream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
  }

  stop(): void {
    if (this.workletNode) {
      this.workletNode.port.postMessage({ command: "stop" });
      this.workletNode.disconnect();
      this.workletNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      void this.audioContext.close();
      this.audioContext = null;
    }
  }
}
