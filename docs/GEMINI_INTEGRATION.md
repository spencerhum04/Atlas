# Gemini Integration Architecture

> **Last Updated:** 2026-02-07

How the AI guide works end-to-end: voice pipeline, Gemini conversation engine, function calling, and session state.

---

## 1. Voice Pipeline Flow

```
User speaks into mic
  → AudioWorklet captures PCM (24kHz, 16-bit, mono)
  → Frontend WebSocket sends base64 audio chunks to backend
  → Backend forwards to Gradium STT (WebSocket)
  → STT returns transcript words + VAD (voice activity detection)
  → VAD detects silence (2.0s horizon, 0.7 threshold) → sets turn_ready
  → Debounce waits 0.5s after last STT word → fires turn
  → _process_gemini_response() called with accumulated transcript
  → Gemini 2.5 Flash streams response (text chunks + function calls)
  → Text chunks → Gradium TTS (WebSocket) → base64 audio → frontend → speaker
  → Function calls → executed by backend → results sent to frontend + Gemini history
  → After function results added → Gemini called again for follow-up voice response
```

**Key files:**
- `backend/routers/voice.py` — WebSocket endpoint, pipeline orchestration
- `backend/services/gemini_guide.py` — Gemini conversation engine
- `backend/services/gradium_service.py` — STT/TTS WebSocket clients
- `frontend/src/audio/VoiceConnection.ts` — Frontend WebSocket orchestrator

---

## 2. Gemini Conversation History

The `GeminiGuide` class maintains conversation state as a list of `types.Content` entries:

```python
self.conversation_history: list[types.Content] = []
```

Each entry has a `role` and `parts`:

| Role | Parts | When Added |
|------|-------|------------|
| `"user"` | `text` (user's spoken words) | When a turn fires |
| `"model"` | `text` + `function_call` | After Gemini responds |
| `"user"` | `function_response` | After a function call is executed |

**Example conversation history** for "Take me to ancient Rome":
```
[0] user:  text:"Take me to ancient Rome"
[1] model: text:"Ancient Rome! What a magnificent choice..." + fn_call:suggest_location
[2] user:  fn_resp:suggest_location → {"status": "location_suggested"}
[3] model: text:"I've placed a marker on Rome for you..."
```

### System Prompt

Rebuilt dynamically on every Gemini call with current context:

```python
GUIDE_SYSTEM_PROMPT = """You are a warm, knowledgeable historical guide...

Current context:
- Location: {location_name} ({lat}, {lng})
- Time Period: {time_period} ({year})
- Phase: {phase} (globe_selection | loading | exploring)

Behavior by phase:
- globe_selection: Greet user, suggest locations, share facts
- loading: Narrate the destination, tell stories, call select_music
- exploring: Tour guide mode, 2-3 sentence responses, share facts
"""
```

Context is updated by the frontend via `context` and `phase` WebSocket messages. Changes take effect on the next Gemini call.

### Session Lifetime

- One `GeminiGuide` instance per WebSocket connection
- History persists for the entire session (until disconnect)
- On reconnect: fresh instance, fresh history, fresh context
- History is unbounded — Gemini 2.5 Flash has a 1M token context window, so a 2-3 minute voice session won't approach limits

---

## 3. Function Calling Protocol

Gemini's multi-turn function calling flow:

```
Round 1:
  User message → Gemini responds with text + function_call(s)
  → Execute function(s), add results to history

Round 2 (continuation):
  No new user message → Gemini reads function results
  → Responds with natural language about what happened
  → May make additional function calls → repeat

Loop ends when Gemini responds with text only (no function calls).
```

**Safety limit:** MAX_FUNCTION_ROUNDS = 3 prevents infinite loops.

### Important: google_search Cannot Be Combined with Function Declarations

Gemini 2.5 Flash returns a 400 error if you include both `google_search` and `function_declarations` in the same request. We use function tools only.

---

## 4. Tool Calls

### trigger_world_generation

**Purpose:** Start 3D world generation via World Labs API when user wants to explore.

| Parameter | Type | Description |
|-----------|------|-------------|
| `location` | string | The place to generate (e.g. "Ancient Rome") |
| `time_period` | string | Historical era (e.g. "Roman Republic, 100 BC") |
| `scene_description` | string | Vivid description for World Labs prompt |

**Backend action:** Calls `world_labs.generate_world()`, starts background polling task.
**Frontend receives:** `{ type: "world_status", status: "generating" }` immediately, then `{ type: "world_status", status: "ready", worldId, splatUrl }` when done.
**Gemini result:** `{ status: "generation_started", operation_id: "..." }`

### select_music

**Purpose:** Queue era-appropriate background music during loading/exploration.

| Parameter | Type | Description |
|-----------|------|-------------|
| `era` | string | Historical era (e.g. "ancient", "medieval") |
| `region` | string | Geographic region (e.g. "europe", "asia") |
| `mood` | string | One of: contemplative, majestic, adventurous, peaceful, dramatic |

**Backend action:** Calls `select_track()` to find best matching track from library.
**Frontend receives:** `{ type: "music", trackUrl: "/music/track.mp3" }`
**Gemini result:** `{ status: "playing", track: "Track Title" }` or `{ status: "no_track_found" }`

### generate_fact

**Purpose:** Display a historical fact as an overlay card in the explorer.

| Parameter | Type | Description |
|-----------|------|-------------|
| `fact_text` | string | Concise fact, 1-2 sentences |
| `category` | string | One of: culture, technology, politics, daily_life, art |

**Backend action:** Forwards directly to frontend.
**Frontend receives:** `{ type: "fact", text: "...", category: "culture" }`
**Gemini result:** `{ status: "displayed" }`

### suggest_location

**Purpose:** Place a marker on the globe and fly the camera to a specific location.

| Parameter | Type | Description |
|-----------|------|-------------|
| `lat` | number | Latitude |
| `lng` | number | Longitude |
| `name` | string | Human-readable name (e.g. "Rome, Italy") |

**Backend action:** Forwards coordinates + name to frontend.
**Frontend receives:** `{ type: "suggested_location", lat, lng, name }`
**Gemini result:** `{ status: "location_suggested" }`

---

## 5. Session State

### What's Tracked

| State | Where | Updated By |
|-------|-------|------------|
| Location (name, lat, lng) | `GeminiGuide.context` | Frontend `context` message |
| Time period (label, year) | `GeminiGuide.context` | Frontend `context` message |
| Phase (globe_selection/loading/exploring) | `GeminiGuide.context` | Frontend `phase` message |
| Conversation history | `GeminiGuide.conversation_history` | Auto-managed per Gemini call |

### What's NOT Tracked (and doesn't need to be for hackathon)

- User name/identity — guide can learn it from conversation naturally (it's in history)
- Persistent sessions across reconnects — not needed for demo
- Summary/compression of long conversations — sessions are short enough

### How Context Flows

1. User clicks a location on the globe → frontend sends `{ type: "context", location: {...}, timePeriod: {...} }`
2. Backend calls `gemini.update_context(location_name=..., lat=..., ...)`
3. Next Gemini call rebuilds system prompt with new context
4. Gemini now knows where/when the user is exploring

Phase transitions work the same way — frontend sends `{ type: "phase", phase: "loading" }` and Gemini adjusts its behavior accordingly.
