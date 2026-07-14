# Interrupt Mode: Speech-Based vs Noise-Based

The app supports two modes for how user voice interrupts the AI's TTS playback.

## Current Mode: Speech-Based (STT Transcript)

Interruption only triggers when the backend STT (Gradium) recognizes actual words and sends a `transcript` message back. This avoids false interruptions from room noise, coughs, etc.

**Trade-off:** Slightly slower response (~0.5-1s delay) since it waits for STT processing.

**Location:** `frontend/src/audio/VoiceConnection.ts`, lines ~90 and ~230

## How to Switch to Noise-Based (Instant VAD)

Interruption triggers instantly when the mic picks up any sound above the RMS threshold (0.04). Much faster but will false-trigger on ambient noise.

### Step 1: Restore VAD interrupt callback (~line 91)

Replace:
```typescript
undefined, // VAD not used for interrupt — speech-based interrupt via STT transcript
```

With:
```typescript
() => {
  // Voice activity detected on mic — instant barge-in
  const playing = this.playback.isPlaying;
  if (playing) {
    console.log(
      "[VC] MIC ACTIVITY detected while playback active → INTERRUPT",
    );
    this.playback.interrupt();
    this.activeResponseId = null;
    this.send({ type: "interrupt" });
    this.emit("responseStart");
  }
},
```

### Step 2: Remove interrupt from transcript handler (~line 230)

Replace the transcript case block:
```typescript
case "transcript": {
  console.log(`[BE→VC] #${msgCount} TRANSCRIPT: "${msg.text}"`);
  this.emit("responseStart");
  if (this.playback.isPlaying) {
    console.log("[VC] TRANSCRIPT received while playback active → INTERRUPT");
    this.playback.interrupt();
    this.activeResponseId = null;
    this.send({ type: "interrupt" });
  }
  this.emit("transcript", msg.text as string);
  break;
}
```

With:
```typescript
case "transcript":
  console.log(`[BE→VC] #${msgCount} TRANSCRIPT: "${msg.text}"`);
  this.emit("responseStart");
  this.emit("transcript", msg.text as string);
  break;
```

### Step 3 (Optional): Tune VAD sensitivity

In `frontend/public/audio-processor.js`:
- `VOICE_THRESHOLD` (default 0.04) — raise to reduce false triggers, lower for more sensitivity
- `VOICE_COOLDOWN_MS` (default 300) — minimum time between interrupt triggers

That's it — one file, two changes.
