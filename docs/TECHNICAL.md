# Technical Document

> **Project Name:** TBD
> **Last Updated:** 2026-02-07

---

## 1. Tech Stack

| Layer | Technology | Version | Why |
|-------|-----------|---------|-----|
| Frontend Framework | Vite + React + TypeScript | React 19, Vite 6 | Fast dev server, minimal config, strong TS support |
| 3D Globe | react-globe.gl + CartoDB tiles | Latest | Three.js-based React wrapper for globe.gl; CartoDB Dark Matter tiles provide real map imagery at all zoom levels; click-to-coordinate, markers, fly-to built-in; no API key needed |
| 3D World Renderer | SparkJS (`@sparkjsdev/spark`) | 0.1.10 | World Labs' recommended Gaussian splat renderer, Three.js-based |
| 3D Engine | Three.js | r170+ | Required by react-globe.gl and SparkJS (shared single instance) |
| Reverse Geocoding | Nominatim (OpenStreetMap) | Free | Click lat/lng → human-readable place name; no API key; 1 req/s limit (fine for interactive use) |
| Particle Effects | tsParticles | Latest | Star field on landing page |
| State Management | Zustand | Latest | Minimal boilerplate, no providers, fast |
| Styling | Tailwind CSS v4 | Latest | Rapid prototyping, glassmorphism utilities |
| Backend Framework | Python FastAPI | Latest | WebSocket support, async, Gradium Python SDK compatibility |
| Voice STT | Gradium WebSocket API | Latest | `wss://us.api.gradium.ai/api/speech/asr` |
| Voice TTS | Gradium WebSocket API | Latest | `wss://us.api.gradium.ai/api/speech/tts` |
| LLM Intelligence | Google Gemini API | Gemini 2.5 Flash | Function calling, Google Search grounding, streaming |
| 3D World Generation | World Labs Marble API | v1 | Text → 3D Gaussian splat world |
| Audio Playback | Web Audio API | Native | Browser-native, low-latency audio streaming + music |

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                   FRONTEND (Vite + React)                │
│                                                          │
│  ┌────────────┐  ┌─────────────┐  ┌───────────────────┐ │
│  │  Landing   │  │  Globe +    │  │  World Explorer   │ │
│  │  (tsParti- │→ │  Time       │→ │  (SparkJS/Three)  │ │
│  │   cles)    │  │  Selector   │  │  + Facts Overlay  │ │
│  └────────────┘  └─────────────┘  └───────────────────┘ │
│                         ↕                                │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Loading Experience (AI narration + visuals + music) ││
│  └──────────────────────────────────────────────────────┘│
│                                                          │
│  ┌──────────────────────────────────────────────────────┐│
│  │  Voice UI: AudioWorklet mic → WebSocket              ││
│  │  Audio Playback: Web Audio API (TTS + music)         ││
│  └──────────────────┬───────────────────────────────────┘│
└─────────────────────┼────────────────────────────────────┘
                      │ WebSocket (bidirectional)
                      │
┌─────────────────────┼────────────────────────────────────┐
│            BACKEND (Python FastAPI)                       │
│                     │                                    │
│  ┌──────────────────┴───────────────────────────┐        │
│  │         Voice WebSocket Router               │        │
│  │                                              │        │
│  │  Audio chunks in                             │        │
│  │    ↓                                         │        │
│  │  Gradium STT (WebSocket)                     │        │
│  │    ↓ transcript                              │        │
│  │  Gemini (streaming text generation)          │        │
│  │    ↓ response text                           │        │
│  │  Gradium TTS (WebSocket)                     │        │
│  │    ↓ audio chunks                            │        │
│  │  Audio chunks out                            │        │
│  └──────────────────────────────────────────────┘        │
│                                                          │
│  ┌───────────────────┐  ┌──────────────────────┐         │
│  │  World Labs       │  │  Music Selector      │         │
│  │  Service          │  │  Service             │         │
│  │  - Generate       │  │  - Track metadata    │         │
│  │  - Poll status    │  │  - LLM selection     │         │
│  │  - Fetch assets   │  │  - Serve track URL   │         │
│  └───────────────────┘  └──────────────────────┘         │
└──────────────────────────────────────────────────────────┘
```

---

## 3. Globe Integration (react-globe.gl)

### 3.1 Package & Compatibility

- **Package:** `react-globe.gl` (React wrapper for `globe.gl` → `three-globe` → Three.js)
- **Three.js dedup:** Both react-globe.gl (`>=0.154 <1`) and SparkJS (`^0.170`) overlap at r170+. Verify single instance with `npm ls three`. If duplicated, add `"overrides": { "three": "^0.170.0" }` to `package.json`.
- **React 19:** May need `--legacy-peer-deps` during install if peer dep warnings appear.

### 3.2 Tile Engine (CartoDB Dark Matter)

react-globe.gl renders a blank sphere by default. The `globeTileEngineUrl` prop accepts a function `(x, y, level) => tileUrl` to load real map tiles.

```typescript
const CARTO_SUBDOMAINS = ['a', 'b', 'c', 'd'];

const cartoTileUrl = (x: number, y: number, l: number): string => {
  const subdomain = CARTO_SUBDOMAINS[(x + y) % CARTO_SUBDOMAINS.length];
  return `https://${subdomain}.basemaps.cartocdn.com/dark_nolabels/${l}/${x}/${y}.png`;
};
```

- Use `dark_nolabels` (not `dark_all`) — flat text labels look distorted on a 3D sphere.
- CartoDB tiles are CORS-enabled, free, no API key required.
- Tiles load progressively on zoom — city-level detail available at high zoom levels.

### 3.3 Click → Location Selection

```typescript
// onGlobeClick returns { lat, lng } for any click on the globe surface
<GlobeGL onGlobeClick={({ lat, lng }) => {
    const name = await reverseGeocode(lat, lng);  // Nominatim
    setLocation({ lat, lng, name });               // Zustand store
}} />
```

**Reverse geocoding via Nominatim (free, no key):**
```typescript
async function reverseGeocode(lat: number, lng: number): Promise<string> {
    const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=6&addressdetails=1`,
        { headers: { 'User-Agent': 'QHacks2026-Globe/1.0' } }  // Required by Nominatim policy
    );
    const data = await res.json();
    const addr = data.address;
    return [addr?.city || addr?.town || addr?.state, addr?.country]
        .filter(Boolean).join(', ') || `${lat.toFixed(2)}, ${lng.toFixed(2)}`;
}
```

### 3.4 Markers (Points + Pulsing Rings)

Two visual layers combine for a glowing marker effect:

```typescript
// Static cyan pin at selected location
pointsData={location ? [{ lat: location.lat, lng: location.lng }] : []}
pointColor={() => '#00d4ff'}
pointAltitude={0.06}
pointRadius={0.6}

// Pulsing concentric rings radiating from the pin
ringsData={location ? [{
    lat: location.lat, lng: location.lng,
    maxR: 5, propagationSpeed: 3, repeatPeriod: 1200
}] : []}
ringColor={() => (t: number) => `rgba(0, 212, 255, ${Math.sqrt(1 - t)})`}
```

### 3.5 Camera Fly-To

```typescript
// Via ref — works for both user clicks and backend-driven location suggestions
const globeRef = useRef<GlobeInstance>(null);

// Fly to a location with smooth animation
globeRef.current.pointOfView(
    { lat, lng, altitude: 1.5 },  // altitude in globe-radius units (2.5=far, 1.5=regional, 0.5=city)
    1500                           // animation duration in ms
);
```

A `useEffect` watching `location` in Zustand triggers fly-to on ANY location change — whether from user click or from backend `suggested_location` message. This ensures a single codepath for both flows.

### 3.6 Backend-Driven Location Suggestion

The AI guide can suggest locations via a Gemini function tool. Flow:
1. Gemini calls `suggest_location({ lat, lng, name })` function tool
2. Backend sends WebSocket message: `{ type: "suggested_location", lat, lng, name }`
3. Frontend `useVoiceWebSocket` handler calls `setLocation()` in Zustand
4. Globe's `useEffect` detects location change → places marker + flies camera to it

### 3.7 Styling & Behavior

```typescript
<GlobeGL
    globeTileEngineUrl={cartoTileUrl}
    backgroundColor="rgba(0, 0, 0, 0)"   // Transparent — parent container handles bg
    showAtmosphere={true}
    atmosphereColor="#4a9eff"              // Blue glow matching cosmic theme
    atmosphereAltitude={0.2}
    animateIn={true}
/>
```

- **Auto-rotate:** Enable `controls().autoRotate = true` with `autoRotateSpeed = 0.4` on mount. Disable on first user interaction.
- **Resize handling:** Track `window.innerWidth/Height` in state, pass as `width/height` props.

### 3.8 WebGL Context Cleanup

**Critical:** Browsers limit simultaneous WebGL contexts (~8-16). The globe must release its context before SparkJS creates one for world rendering.

```typescript
useEffect(() => {
    return () => {
        const renderer = globeRef.current?.renderer();
        if (renderer) {
            renderer.dispose();
            renderer.forceContextLoss();
        }
    };
}, []);
```

### 3.9 TypeScript Typing

react-globe.gl's ref type doesn't expose imperative methods. Create a custom interface:

```typescript
// frontend/src/types/globe.d.ts
export interface GlobeInstance {
    pointOfView: (pov: { lat?: number; lng?: number; altitude?: number }, transitionMs?: number) => void;
    controls: () => { autoRotate: boolean; autoRotateSpeed: number; enableZoom: boolean };
    scene: () => THREE.Scene;
    camera: () => THREE.Camera;
    renderer: () => THREE.WebGLRenderer;
}
```

---

## 4. Voice Pipeline (Critical Path)

This is the most complex and important subsystem. The pipeline must feel real-time.

### 3.1 Audio Capture (Frontend)

Adapted from KingHacks2026 AudioWorklet (`KingHacks2026/frontend/renderer/audio-processor.js`).

```
Browser Microphone
  → MediaStream (getUserMedia)
  → AudioContext (sampleRate: 24000)
  → AudioWorkletNode ('audio-stream-processor')
  → Buffers Float32 → Int16 PCM (24kHz, 16-bit, mono)
  → Posts chunks to main thread
  → Main thread sends via WebSocket to backend
```

**Key adaptation from KingHacks:** Change sample rate from 16kHz to 24kHz (Gradium STT requires 24kHz).

### 3.2 Backend Voice Router

```python
# FastAPI WebSocket endpoint
@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    await websocket.accept()

    # Open Gradium STT + TTS connections
    stt_ws = await connect_gradium_stt()
    tts_ws = await connect_gradium_tts(voice_id="...")

    # Concurrent tasks:
    # 1. Receive audio from frontend → forward to Gradium STT
    # 2. Receive transcripts from Gradium STT → send to Gemini
    # 3. Receive Gemini response → send to Gradium TTS
    # 4. Receive TTS audio from Gradium → forward to frontend
```

### 3.3 Gradium STT Integration

```python
# WebSocket: wss://us.api.gradium.ai/api/speech/asr
# Auth header: x-api-key: YOUR_API_KEY
#
# IMPORTANT: Setup message MUST be the first message sent after connection.
# Server will close the connection if any other message is sent first.
#
# Setup message:
{
    "type": "setup",
    "model_name": "default",
    "input_format": "pcm",
    "language": "en"
}
# IMPORTANT: After sending setup, wait for ready before sending audio:
# Ready:     { "type": "ready", "request_id": "...", "model_name": "default", "sample_rate": 24000, "frame_size": 1920 }
#
# Audio input: PCM 24kHz, 16-bit signed int, mono
# Audio chunks must be base64-encoded in JSON: { "type": "audio", "audio": "<base64>" }
# Recommended chunk size: 1920 samples (80ms at 24kHz)
#
# Server returns three message types:
#
# Ready:     { "type": "ready", "request_id": "...", ... }  (sent once after setup)
# Transcript: { "type": "text", "text": "...", "start_s": 0.5, "end_s": 2.3 }
# VAD:        { "type": "step", "vad": [{"horizon_s": 0.5, "inactivity_prob": 0.05}, {"horizon_s": 1.0, "inactivity_prob": 0.08}, ...] }
#
# Turn detection: check max inactivity_prob across all horizons; trigger when > 0.5
```

**Python SDK (recommended over raw WebSocket):**
```python
import gradium

client = gradium.client.GradiumClient(api_key="...", region="us")

stream = await client.stt_stream(
    setup={"model_name": "default", "input_format": "pcm"}
)

# Feed audio chunks, iterate transcripts
async for message in stream.iter_text():
    print(f"Text: {message['text']}")  # start_s, end_s also available
```

### 3.4 Gemini Integration

```python
from google import genai

client = genai.Client(api_key=GEMINI_API_KEY)

response = client.models.generate_content_stream(
    model="gemini-2.5-flash",
    contents=conversation_history,
    config={
        "system_instruction": GUIDE_SYSTEM_PROMPT,
        # NOTE: google_search CANNOT be combined with function_declarations
        # in a single request for gemini-2.5-flash (causes 400 error).
        # Use function tools only; add google_search in a separate call if needed.
        "tools": [
            trigger_world_generation,
            select_music,
            generate_fact,
            suggest_location
        ]
    }
)
```

### 3.5 Gradium TTS Integration

```python
# WebSocket: wss://us.api.gradium.ai/api/speech/tts
# Auth header: x-api-key: YOUR_API_KEY
#
# IMPORTANT: Setup message MUST be the first message sent after connection.
#
# Setup message:
{
    "type": "setup",
    "voice_id": "SELECTED_VOICE_ID",
    "model_name": "default",
    "output_format": "pcm"
}
# output_format options: "wav", "pcm", "opus", "pcm_8000", "pcm_16000", "pcm_24000",
#                        "ulaw_8000", "alaw_8000"
#
# IMPORTANT: After sending setup, wait for ready before sending text:
# Ready:     { "type": "ready", "request_id": "..." }
#
# Send text:   { "type": "text", "text": "Hello world" }  (can stream incrementally)
# Receive:     { "type": "audio", "audio": "<base64-encoded PCM>" }  (48kHz, 16-bit, mono, 3840 samples per chunk = 80ms)
# End signal:  { "type": "end_of_stream" }  (client sends to finish; server sends after final audio)
# Timestamps:  { "type": "text", "text": "Hello", "start_s": 0.2, "stop_s": 0.6 }  (word-level timing)
# Latency: <300ms time-to-first-audio
```

**Python SDK (recommended over raw WebSocket):**
```python
stream = await client.tts_stream(
    setup={
        "model_name": "default",
        "voice_id": "YTpq7expH9539ERJ",
        "output_format": "pcm"
    },
    text=text_generator()  # async generator yielding text chunks from Gemini
)

async for audio_chunk in stream.iter_bytes():
    # Forward audio_chunk to frontend via WebSocket
    pass
```

### 3.6 Audio Playback (Frontend)

```
WebSocket receives PCM audio chunks from backend
  → ArrayBuffer → Float32Array conversion
  → AudioBuffer creation (48kHz, mono)
  → Queue buffers in playback scheduler
  → AudioBufferSourceNode → AudioContext.destination
  → User hears AI guide speaking
```

---

## 4. Gemini AI Guide Design

### 4.1 System Prompt

```
You are a warm, knowledgeable historical guide helping users explore any place
and time period in human history. You speak conversationally — vivid but concise.

Current context:
- Location: {location_name} ({lat}, {lng})
- Time Period: {time_period} ({year})
- Phase: {current_phase} (globe_selection | loading | exploring)

Behavior by phase:
- globe_selection: Greet the user. When they select a location/time, share
  2-3 fascinating facts. Ask if they'd like to explore. If they say yes,
  call trigger_world_generation.
- loading: Narrate a rich, immersive description of the destination. Tell
  stories. Paint a picture with words. Keep talking until the world is ready.
  Call select_music to queue era-appropriate music.
- exploring: Be a tour guide. Point out features. Answer questions. Share
  facts via generate_fact. Keep responses to 2-3 sentences.

Personality: Enthusiastic but not over-the-top. Scholarly but accessible.
Think David Attenborough meets a history professor who loves their subject.
```

### 4.2 Function Calling Tools

```python
trigger_world_generation = {
    "name": "trigger_world_generation",
    "description": "Trigger 3D world generation when the user wants to explore a location/era",
    "parameters": {
        "type": "object",
        "properties": {
            "location": {"type": "string", "description": "The place to generate"},
            "time_period": {"type": "string", "description": "The historical era"},
            "scene_description": {"type": "string", "description": "Vivid description of the scene to generate"}
        },
        "required": ["location", "time_period", "scene_description"]
    }
}

select_music = {
    "name": "select_music",
    "description": "Select background music that fits the era, region, and mood",
    "parameters": {
        "type": "object",
        "properties": {
            "era": {"type": "string"},
            "region": {"type": "string"},
            "mood": {"type": "string", "enum": ["contemplative", "majestic", "adventurous", "peaceful", "dramatic"]}
        },
        "required": ["era", "region", "mood"]
    }
}

generate_fact = {
    "name": "generate_fact",
    "description": "Generate a historical fact to display as an overlay card",
    "parameters": {
        "type": "object",
        "properties": {
            "fact_text": {"type": "string", "description": "A concise, interesting historical fact (1-2 sentences)"},
            "category": {"type": "string", "enum": ["culture", "technology", "politics", "daily_life", "art"]}
        },
        "required": ["fact_text", "category"]
    }
}

suggest_location = {
    "name": "suggest_location",
    "description": "Suggest a specific location on the globe for the user to explore. The frontend will place a marker and fly the camera to this location.",
    "parameters": {
        "type": "object",
        "properties": {
            "lat": {"type": "number", "description": "Latitude of the location"},
            "lng": {"type": "number", "description": "Longitude of the location"},
            "name": {"type": "string", "description": "Human-readable name of the location (e.g., 'Rome, Italy')"}
        },
        "required": ["lat", "lng", "name"]
    }
}
```

---

## 5. World Labs Integration

### 5.1 Models

| Model | Generation Time | Cost (text input) | Quality |
|-------|----------------|-------------------|---------|
| `Marble 0.1-plus` | ~5 minutes | 1,580 credits | High |
| `Marble 0.1-mini` | **30–45 seconds** | 230 credits | Lower but usable |

**Recommendation:** Use `Marble 0.1-mini` for the live demo flow (30s wait is manageable). Use `Marble 0.1-plus` for pre-generated showcase worlds.

**Credits:** $1.00 = 1,250 credits. Min purchase $5 = 6,250 credits. Free tier: 4 generations/month.
**IMPORTANT:** API credits are separate from Marble app credits — must purchase at platform.worldlabs.ai.

### 5.2 Generation Flow

```python
import httpx
import asyncio

WORLD_LABS_BASE = "https://api.worldlabs.ai/marble/v1"

async def generate_world(scene_description: str, model: str = "Marble 0.1-mini") -> str:
    """Returns operation_id for polling."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{WORLD_LABS_BASE}/worlds:generate",
            headers={
                "WLT-Api-Key": API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "display_name": "QHacks World",
                "world_prompt": {
                    "type": "text",
                    "text_prompt": scene_description
                },
                "model": model
            }
        )
        return response.json()["operation_id"]

async def poll_world_status(operation_id: str) -> dict:
    """Poll until world is ready. Returns world data with assets."""
    async with httpx.AsyncClient() as client:
        while True:
            response = await client.get(
                f"{WORLD_LABS_BASE}/operations/{operation_id}",
                headers={"WLT-Api-Key": API_KEY}
            )
            data = response.json()
            if data.get("done"):
                return data["result"]  # Contains world object with assets
            await asyncio.sleep(5)  # Poll every 5 seconds

async def get_world_assets(world_id: str) -> dict:
    """Fetch splat URLs, panorama, mesh."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{WORLD_LABS_BASE}/worlds/{world_id}",
            headers={"WLT-Api-Key": API_KEY}
        )
        return response.json()
```

### 5.3 Response Schema

```json
{
  "id": "world_abc123",
  "display_name": "QHacks World",
  "world_marble_url": "https://marble.worldlabs.ai/world/world_abc123",
  "assets": {
    "splats": {
      "spz_urls": [
        "https://...100k.spz",
        "https://...500k.spz",
        "https://...full.spz"
      ]
    },
    "mesh": {
      "collider_mesh_url": "https://...collider.glb"
    },
    "imagery": {
      "pano_url": "https://...pano.jpg"
    },
    "caption": "AI-generated description",
    "thumbnail_url": "https://...thumb.jpg"
  }
}
```

**Splat resolutions:** 100k (fast preview) | 500k (balanced) | full (best quality).
Use 500k for the demo — good balance of quality and load time.
**Note:** SPZ URLs are pre-signed and may expire — render them promptly.

### 5.4 SparkJS Rendering (Frontend)

```typescript
import * as THREE from 'three';
import { SplatMesh, SparkControls } from '@sparkjsdev/spark';

function WorldScene({ splatUrl }: { splatUrl: string }) {
    const mountRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

        // IMPORTANT: antialias must be false for splat rendering performance
        const renderer = new THREE.WebGLRenderer({ antialias: false });
        renderer.setSize(window.innerWidth, window.innerHeight);
        mountRef.current!.appendChild(renderer.domElement);

        // Load World Labs splat (use 500k resolution for balanced quality/speed)
        const world = new SplatMesh({
            url: splatUrl,
            onLoad: () => console.log('World loaded')
        });
        scene.add(world);

        // SparkJS built-in FPS controls (keyboard + mouse + gamepad + touch)
        const controls = new SparkControls();
        const clock = new THREE.Clock();

        renderer.setAnimationLoop(() => {
            controls.update(camera, clock.getDelta());
            renderer.render(scene, camera);
        });

        return () => {
            renderer.dispose();
            renderer.setAnimationLoop(null);
        };
    }, [splatUrl]);

    return <div ref={mountRef} className="w-full h-full" />;
}
```

**SplatMesh constructor options:**
```typescript
new SplatMesh({
    url: string,              // Fetch SPZ from URL
    fileBytes?: Uint8Array,   // Or provide raw bytes
    maxSplats?: number,       // Reserve space
    onLoad?: (mesh) => void,  // Load callback
    editable?: boolean        // Default: true
})
// Supported formats: .spz, .ply, .splat, .ksplat
```

---

## 6. Music System

### 6.1 Library Structure

```typescript
// frontend/src/data/musicLibrary.ts
interface MusicTrack {
    id: string;
    title: string;
    file: string;        // path in /public/music/
    era: string;          // "ancient", "medieval", "renaissance", "baroque", "classical", "modern"
    region: string;       // "europe", "asia", "middle_east", "africa", "americas"
    mood: string;         // "contemplative", "majestic", "adventurous", "peaceful", "dramatic"
    attribution: string;  // CC license info
}

export const musicLibrary: MusicTrack[] = [
    {
        id: "ancient-rome-majestic",
        title: "Glory of the Forum",
        file: "/music/ancient-rome-majestic.mp3",
        era: "ancient",
        region: "europe",
        mood: "majestic",
        attribution: "..."
    },
    // ... 15-20 tracks
];
```

### 6.2 Selection Flow

1. Gemini calls `select_music({ era: "ancient", region: "europe", mood: "majestic" })`
2. Backend matches against `musicLibrary` metadata
3. Returns best matching track URL to frontend
4. Frontend plays via Web Audio API with crossfade from previous track

---

## 7. Frontend State (Zustand)

```typescript
// frontend/src/store.ts
import { create } from 'zustand';

interface AppState {
    // App phase
    phase: 'landing' | 'globe' | 'loading' | 'exploring';
    setPhase: (phase: AppState['phase']) => void;

    // Location & time
    location: { lat: number; lng: number; name: string } | null;
    timePeriod: { year: number; era: string; label: string } | null;
    setLocation: (loc: AppState['location']) => void;
    setTimePeriod: (tp: AppState['timePeriod']) => void;

    // Voice state
    isListening: boolean;
    isSpeaking: boolean;
    transcript: string;
    setListening: (v: boolean) => void;
    setSpeaking: (v: boolean) => void;
    setTranscript: (t: string) => void;

    // World generation
    worldStatus: 'idle' | 'generating' | 'ready' | 'error';
    worldId: string | null;
    splatUrl: string | null;
    setWorldStatus: (s: AppState['worldStatus']) => void;
    setWorldData: (id: string, url: string) => void;

    // Music
    currentTrack: string | null;
    isMusicPlaying: boolean;
    setCurrentTrack: (t: string | null) => void;
    setMusicPlaying: (v: boolean) => void;

    // Conversation
    messages: Array<{ role: 'user' | 'guide'; text: string }>;
    addMessage: (msg: { role: 'user' | 'guide'; text: string }) => void;

    // Facts
    facts: Array<{ text: string; category: string; visible: boolean }>;
    addFact: (f: { text: string; category: string }) => void;
}
```

---

## 8. WebSocket Protocol (Frontend ↔ Backend)

All communication over a single WebSocket connection at `ws://backend/ws/voice`.

### Messages: Frontend → Backend

```typescript
// Audio chunk from microphone
{ type: "audio", data: "<base64 PCM>" }

// Set context (location/time selected)
{ type: "context", location: {...}, timePeriod: {...} }

// Phase change notification
{ type: "phase", phase: "globe" | "loading" | "exploring" }
```

### Messages: Backend → Frontend

```typescript
// Transcript from Gradium STT
{ type: "transcript", text: "...", partial: boolean }

// TTS audio chunk from Gradium
{ type: "audio", data: "<base64 PCM>" }

// World generation status
{ type: "world_status", status: "generating" | "ready" | "error", worldId?: string, splatUrl?: string }

// Music selection
{ type: "music", trackUrl: string }

// Fact to display
{ type: "fact", text: string, category: string }

// Guide text (for display alongside voice)
{ type: "guide_text", text: string }

// AI guide suggests a location → frontend places marker + flies camera to it
{ type: "suggested_location", lat: number, lng: number, name: string }
```

---

## 9. File Structure

```
QHacks-2026/
├── docs/
│   ├── PRD.md
│   ├── TECHNICAL.md
│   ├── ROADMAP.md
│   └── CHANGELOG.md
├── frontend/
│   ├── public/
│   │   └── music/                    # Curated royalty-free tracks (.mp3)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Landing.tsx           # Particles + Enter button
│   │   │   ├── Globe.tsx             # react-globe.gl + CartoDB tiles + markers + fly-to
│   │   │   ├── TimeSelector.tsx      # Era scroll/wheel picker
│   │   │   ├── LoadingExperience.tsx  # Narration + visuals during generation
│   │   │   ├── WorldExplorer.tsx     # SparkJS 3D world renderer
│   │   │   ├── FactOverlay.tsx       # Floating historical fact cards
│   │   │   ├── VoiceUI.tsx           # Mic button + transcript display
│   │   │   └── MusicPlayer.tsx       # Background audio controls
│   │   ├── hooks/
│   │   │   ├── useVoiceWebSocket.ts  # WebSocket connection + message handling
│   │   │   └── useAudioCapture.ts    # AudioWorklet mic capture
│   │   ├── data/
│   │   │   └── musicLibrary.ts       # Track metadata
│   │   ├── types/
│   │   │   └── globe.d.ts            # GlobeInstance interface for typed ref
│   │   ├── workers/
│   │   │   └── audio-processor.js    # AudioWorklet (adapted from KingHacks)
│   │   ├── store.ts                  # Zustand state
│   │   ├── App.tsx                   # Phase router
│   │   └── main.tsx                  # Entry point
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── tsconfig.json
├── backend/
│   ├── main.py                       # FastAPI app, CORS, mount routers
│   ├── config.py                     # Environment variables, API keys
│   ├── routers/
│   │   ├── voice.py                  # WebSocket voice pipeline
│   │   └── worlds.py                 # World generation REST endpoints
│   ├── services/
│   │   ├── gradium_service.py        # Gradium STT/TTS WebSocket client
│   │   ├── gemini_guide.py           # Gemini conversation + function calling
│   │   ├── world_labs.py             # World Labs API client
│   │   └── music_selector.py         # Music metadata + selection logic
│   ├── requirements.txt
│   └── .env.example
├── README.md
└── .gitignore
```

---

## 10. Environment Variables

```bash
# .env.example
GRADIUM_API_KEY=gd_...
GEMINI_API_KEY=...
WORLD_LABS_API_KEY=WLT-...
FRONTEND_URL=http://localhost:5173   # For CORS
```

---

## 11. Deployment

| Component | Platform | Config |
|-----------|----------|--------|
| Frontend | Vercel | Auto-deploy from git, `VITE_API_URL` env var |
| Backend | Railway or Render | Python runtime, WebSocket support required, env vars |

---

## 12. Key Dependencies

### Frontend (`package.json`)
```json
{
    "dependencies": {
        "react": "^19",
        "react-dom": "^19",
        "three": "^0.170",
        "@sparkjsdev/spark": "^0.1.10",
        "react-globe.gl": "latest",
        "zustand": "latest",
        "@tsparticles/react": "latest",
        "@tsparticles/slim": "latest"
    },
    "devDependencies": {
        "vite": "^6",
        "@vitejs/plugin-react": "latest",
        "typescript": "^5",
        "tailwindcss": "^4",
        "@types/three": "latest"
    }
}
```

### Backend (`requirements.txt`)
```
fastapi
uvicorn[standard]
websockets
gradium
google-genai
httpx
python-dotenv
```
