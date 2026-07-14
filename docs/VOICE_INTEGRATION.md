# Voice Pipeline — Post-Merge Integration Guide

> **For:** EJ (frontend) + Matt (backend)
> **When:** After merging `backend-matt` into EJ's frontend branch

Matt's voice pipeline lives in these files (already in the repo, no conflicts):

```
frontend/src/audio/AudioCaptureService.ts   — Mic → AudioWorklet → PCM chunks
frontend/src/audio/AudioPlaybackService.ts  — TTS PCM → gapless speaker playback
frontend/src/audio/VoiceConnection.ts       — WebSocket orchestrator (ties it all together)
frontend/src/hooks/useVoiceConnection.ts    — React hook wrapping VoiceConnection
frontend/public/audio-processor.js          — AudioWorklet processor (runs on audio thread)
frontend/src/_archived/TestApp.tsx           — Matt's test UI (reference only, not active)
frontend/src/_archived/test-main.tsx         — Matt's test entry point (reference only)
```

---

## 1. Vite Config — Add WebSocket Proxy

EJ's `vite.config.ts` needs the WebSocket proxy so the frontend can reach the backend during dev:

```ts
server: {
  proxy: {
    "/ws": {
      target: "http://localhost:8000",
      ws: true,
    },
  },
},
```

Without this, `VoiceConnection.connect()` will fail — it opens a WebSocket to `/ws/voice` on the same host.

---

## 2. Using the Voice Hook in React

```tsx
import { useVoiceConnection } from "./hooks/useVoiceConnection";

function YourComponent() {
  const { status, transcripts, guideTexts, connect, disconnect } =
    useVoiceConnection();

  // status: "disconnected" | "connecting" | "connected" | "error"
  // transcripts: string[] — what the user said (STT)
  // guideTexts: string[] — what the guide said (Gemini)

  return <button onClick={connect}>Start Voice</button>;
}
```

---

## 3. Listening to More Events

For richer integration (world generation, facts, music, location suggestions), use `VoiceConnection` directly:

```tsx
import { useEffect, useRef } from "react";
import { VoiceConnection } from "./audio/VoiceConnection";

function useVoicePipeline() {
  const vc = useRef(new VoiceConnection());

  useEffect(() => {
    const conn = vc.current;

    conn.on("worldStatus", (status, worldId, splatUrl) => {
      // status: "generating" | "ready" | "error"
      // When "ready": worldId + splatUrl available for SparkJS viewer
    });

    conn.on("fact", (text, category) => {
      // category: "culture" | "technology" | "politics" | "daily_life" | "art"
      // Display as overlay card
    });

    conn.on("music", (trackUrl) => {
      // Play background music: new Audio(trackUrl).play()
    });

    conn.on("suggestedLocation", (lat, lng, name) => {
      // Fly globe camera to this location, place marker
    });

    return () => conn.disconnect();
  }, []);

  return vc.current;
}
```

---

## 4. Sending Context to Backend

When the user selects a location/time on the globe:

```tsx
vc.current.sendContext(
  { lat: 41.9, lng: 12.5, name: "Rome, Italy" },
  { label: "Roman Republic", year: 100 }
);
```

When the phase changes (globe_selection → loading → exploring):

```tsx
vc.current.sendPhase("loading");
```

---

## 5. AudioWorklet File

`frontend/public/audio-processor.js` must be served from the public directory (not bundled). Vite does this automatically for files in `public/`. If EJ's project uses a different static file setup, ensure this file is accessible at `/audio-processor.js` at runtime.

---

## 6. TypeScript Config

The audio pipeline uses:
- `ES2022` target (for `Array.at()`, etc.)
- `strict: true`
- `noUncheckedIndexedAccess: true` (uses `!` assertions on array access)

Make sure EJ's `tsconfig.json` is compatible. The pipeline files use `!` non-null assertions on array indexing which requires either `noUncheckedIndexedAccess: false` or accepting the `!` pattern.

---

## 7. No Extra Dependencies

The voice pipeline uses only browser APIs (WebSocket, AudioContext, AudioWorklet, getUserMedia). No npm packages needed beyond React itself.
