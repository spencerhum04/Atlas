/**
 * AudioWorklet processor for microphone capture with resampling + voice activity detection.
 *
 * Runs on the audio rendering thread (not main thread).
 * Receives Float32 samples at the system's native rate (e.g. 48kHz),
 * downsamples to 24kHz via linear interpolation, converts to Int16 PCM,
 * and posts 1920-sample chunks (80ms at 24kHz = 3840 bytes) to main thread.
 *
 * Also computes RMS energy per process() call and posts:
 *   - voice_activity events for barge-in detection
 *   - mic_level events at ~20Hz for waveform visualization
 *
 * Gradium STT expects: PCM 24kHz, 16-bit signed int, mono.
 */

const TARGET_RATE = 24000;
const CHUNK_SAMPLES = 1920; // 80ms at 24kHz
const VOICE_THRESHOLD = 0.04; // RMS threshold for voice activity (raised to ignore ambient noise)
const VOICE_COOLDOWN_MS = 300; // Don't re-fire within this window
const MIC_LEVEL_INTERVAL_MS = 50; // Send mic level at ~20Hz for waveform visualization

class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Int16Array(CHUNK_SAMPLES);
    this._offset = 0;
    this._stopped = false;
    // sampleRate is a global in AudioWorkletGlobalScope — the context's rate
    this._ratio = sampleRate / TARGET_RATE;
    this._resamplePos = 0; // fractional position in input stream
    this._lastVoiceNotify = 0; // timestamp of last voice_activity post
    this._lastLevelNotify = 0; // timestamp of last mic_level post

    this.port.onmessage = (event) => {
      if (event.data && event.data.command === "stop") {
        this._stopped = true;
      }
    };
  }

  process(inputs) {
    if (this._stopped) return false;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const samples = input[0]; // Float32Array, mono channel
    const inputLen = samples.length;

    // Compute RMS for voice activity detection
    let sumSq = 0;
    for (let i = 0; i < inputLen; i++) {
      sumSq += samples[i] * samples[i];
    }
    const rms = Math.sqrt(sumSq / inputLen);

    if (rms > VOICE_THRESHOLD) {
      const now = currentTime * 1000; // AudioWorklet currentTime is in seconds
      if (now - this._lastVoiceNotify > VOICE_COOLDOWN_MS) {
        this._lastVoiceNotify = now;
        this.port.postMessage({ type: "voice_activity", rms });
      }
    }

    // Send mic level at ~20Hz for waveform visualization
    {
      const now = currentTime * 1000;
      if (now - this._lastLevelNotify > MIC_LEVEL_INTERVAL_MS) {
        this._lastLevelNotify = now;
        this.port.postMessage({ type: "mic_level", rms });
      }
    }

    // Walk through input at steps of _ratio, interpolating to produce 24kHz output
    while (this._resamplePos < inputLen) {
      const idx = Math.floor(this._resamplePos);
      const frac = this._resamplePos - idx;

      // Linear interpolation between adjacent samples
      const a = samples[idx] || 0;
      const b = idx + 1 < inputLen ? samples[idx + 1] : a;
      const val = a + frac * (b - a);

      // Clamp and convert Float32 [-1, 1] → Int16
      const clamped = Math.max(-1, Math.min(1, val));
      this._buffer[this._offset++] =
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this._offset >= CHUNK_SAMPLES) {
        this.port.postMessage(this._buffer.buffer.slice(0));
        this._offset = 0;
      }

      this._resamplePos += this._ratio;
    }

    // Carry over the fractional remainder for the next process() call
    this._resamplePos -= inputLen;

    return true;
  }
}

registerProcessor("audio-capture-processor", AudioCaptureProcessor);
