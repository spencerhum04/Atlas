# Roadmap

> **Team:** 2 people
> **EJ (Person A):** Frontend (React, Globe, SparkJS, UI/UX, audio)
> **Matt (Person B):** Backend (FastAPI, Gradium, Gemini, World Labs, music curation)

---

## Phase 1: Foundation

**Goal:** Scaffolds running, voice pipeline working end-to-end standalone.

### EJ (Frontend)
- [ ] Scaffold Vite + React + TS + Tailwind + Zustand
- [ ] Set up file structure, `.gitignore`, basic `App.tsx` with phase routing
- [ ] Landing page: tsParticles star field (cosmic preset)
- [ ] Glassmorphism "Enter" button centered, fade transition on click
- [ ] Add ambient audio autoplay on landing
- [ ] Globe component: `react-globe.gl` with CartoDB Dark Matter tile engine (`dark_nolabels`)
- [ ] Globe click handler: `onGlobeClick` → extract lat/lng → reverse geocode via Nominatim → store in Zustand
- [ ] Globe markers: `pointsData` (cyan pin) + `ringsData` (pulsing glow rings) at selected location
- [ ] Globe camera fly-to: `useEffect` on `location` change → `pointOfView({ lat, lng, altitude }, 1500)`
- [ ] Globe auto-rotate on mount (stops on first interaction)
- [ ] Globe type declaration: create `frontend/src/types/globe.d.ts` with `GlobeInstance` interface
- [ ] Location info card: glassmorphism overlay at bottom showing location name + coordinates
- [ ] Time selector: vertical scroll/wheel UI showing eras from 3000 BC to present
- [ ] Era labels + visual indicator for selected period
- [ ] Wire location + time selection to Zustand store

### Matt (Backend)
- [x] Scaffold FastAPI project
- [x] Install `gradium`, `google-genai`, `httpx`, `python-dotenv`
- [x] Create `.env` with all API keys, verify each key works with a test call
- [x] Gradium STT service: connect to WebSocket, send test audio, receive transcript
- [x] Gradium TTS service: connect to WebSocket, send test text, receive audio
- [x] Verify both STT and TTS work standalone
- [x] Gemini guide service: set up system prompt, implement `generate_response()` with streaming
- [x] Define function calling tool schemas (world gen, music, facts, suggest_location)
- [x] Voice WebSocket router: wire full pipeline (audio in → Gradium STT → Gemini → Gradium TTS → audio out)
- [x] Test voice pipeline end-to-end with a WebSocket client

### Milestone 1 ✅ (Backend complete — 27/27 tests passing)
> Matt can speak into a WebSocket client and get a Gemini-powered AI guide response back as audio via Gradium. EJ has landing page + globe + time selector rendering.
>
> **Status:** Backend portion complete. All Gradium STT/TTS, Gemini Guide, World Labs, and Music Selector services verified against live APIs. Voice WebSocket pipeline fully wired. EJ frontend pending.

---

## Phase 2: Core Integration

**Goal:** Frontend and backend connected. Full user flow works from globe to world rendering.

### Matt (Voice Client — pulled forward from EJ's scope)
> **Note:** Matt is building the production audio/voice client layer now so the full voice round-trip is proven E2E before EJ starts on the visual frontend. These service classes and hooks will be handed off to EJ for integration.
- [x] AudioWorklet: `audio-processor.js` (24kHz, Float32→Int16 PCM, 1920-sample chunks)
- [x] `AudioCaptureService.ts`: mic → AudioWorklet → PCM chunk callback (framework-agnostic)
- [x] `AudioPlaybackService.ts`: TTS PCM → gapless 48kHz speaker playback (framework-agnostic)
- [x] `VoiceConnection.ts`: WebSocket orchestrator — ties capture/playback to backend protocol
- [x] `useVoiceConnection.ts`: thin React hook wrapper
- [x] Scaffold minimal Vite + React + TS frontend with WS proxy to backend
- [x] Minimal `App.tsx`: one Connect button + transcript/guide text logs for E2E testing
- [x] Verify full voice round-trip: speak → STT → Gemini → TTS → hear response

### Matt + EJ (Voice ↔ Frontend Integration)
- [x] Merge `backend-matt` + `frontend-ej` into `development` branch
- [x] Wire WebSocket hook to Zustand store (suggestedLocation, sessionSummary, guideText → store)
- [x] Voice ↔ Globe integration: send selected location/time to backend via WebSocket `context` message
- [x] Handle `suggested_location` WebSocket messages: update Zustand → Globe auto-pins + flies to location
- [x] Auto-start voice on globe phase, trigger AI welcome via `session_start`
- [x] Phase 1 system prompt: warm, inspirational welcome + location suggestions (no facts/world gen)
- [x] `summarize_session` tool: capture user profile + world description on confirm
- [x] EnterLocation button → `confirm_exploration` → AI goodbye → session summary → phase transition
- [x] GuideSubtitle component: glassmorphic live subtitle overlay
- [x] Show transcript + guide text in UI
- [ ] Globe WebGL context cleanup on phase transition (dispose renderer before SparkJS takes over)
- [ ] Add mic button toggle
- [ ] Loading experience: transition animation (fade + particles)
- [ ] Show AI narration text with typewriter effect
- [ ] Add progress indicator for world generation status
- [ ] SparkJS prototype: set up Three.js scene + SparkJS, load a test SPZ file
- [ ] Get camera controls working (OrbitControls), verify rendering
- [ ] World Explorer component: connect real World Labs splat URL to SparkJS renderer
- [ ] Handle loading states, wire phase transition from loading → exploring when world is ready

### Matt (Backend)
- [x] World Labs service: implement `generate_world()`, `poll_status()`, `get_assets()`
- [ ] Test World Labs with a text prompt, verify world generates and returns SPZ URL
- [x] World Labs + voice integration: when Gemini calls `trigger_world_generation`, start generation
- [x] Send world status updates back through WebSocket, handle async polling
- [x] Music selector: build track metadata index from curated library
- [x] Implement Gemini function call handler for `select_music` — match era/region/mood to track, return URL
- [ ] Narration mode: when world starts generating, switch Gemini to narration mode (longer, storytelling responses)
- [ ] Stream narration text to frontend
- [x] Voice pipeline polish: VAD-based turn detection, handle edge cases (empty transcripts, connection drops)
- [ ] Improve response streaming latency
- [ ] REST endpoint for frontend to poll world status independently
- [ ] Serve splat URLs to frontend, handle generation failures gracefully
- [x] Implement `suggest_location` Gemini function call handler — send `{ type: "suggested_location", lat, lng, name }` via WebSocket

### Milestone 2
> Full voice round-trip proven in browser (speak → hear AI response). User can: Land → Enter → See globe → Click location → Pick era → Talk to AI guide → Say "let's go" → See loading experience → World renders in SparkJS.

---

## Phase 3: Experience Polish

**Goal:** Polished, beautiful, demo-ready experience.

### EJ (Frontend)
- [ ] Music player: Web Audio API integration, play tracks from `/public/music/`
- [ ] Volume control, crossfade between tracks
- [ ] Wire music player to `music` WebSocket messages
- [ ] Facts overlay: floating glass cards that animate in during exploration
- [ ] Auto-dismiss facts after 8 seconds, wire to `fact` WebSocket messages
- [ ] Phase transitions: smooth CSS/Framer Motion animations between all phases
- [ ] Landing fade-out, globe scale-in, loading cinematic transition, world reveal
- [ ] Voice UI polish: pulsing mic indicator when listening
- [ ] Waveform visualization when AI speaks
- [ ] Conversation transcript panel (collapsible)
- [ ] Visual polish: color palette, typography, hover states, responsive layout
- [ ] Glassmorphism consistency, dark theme throughout
- [ ] Loading experience enhancement: constellation lines, glowing orbs, historical imagery fade-ins

### Matt (Backend)
- [ ] Music curation: source 15–20 royalty-free tracks (freemusicarchive.org or similar)
- [ ] Tag each track with era/region/mood metadata, add to repo
- [ ] Fact generation: implement `generate_fact` function call handler in Gemini service
- [ ] Trigger facts periodically during exploration phase (every 30–45 seconds)
- [ ] End-to-end testing: test complete flow multiple times, fix integration bugs
- [ ] Verify all WebSocket message types work correctly
- [ ] Voice quality: tune Gemini system prompt for better responses
- [ ] Adjust Gradium voice parameters (speed, stability), test different voices
- [ ] Error handling: WebSocket reconnection logic, graceful degradation if World Labs fails (show panorama fallback)
- [ ] API rate limit handling
- [ ] Pre-generate 2–3 demo worlds (e.g., Rome 80 AD, Kyoto 1600, Cairo 2500 BC)
- [ ] Store pre-generated world IDs for instant loading during demo

### Milestone 3
> Experience is polished, visually beautiful, and works reliably. 2–3 pre-generated worlds available for instant demo.

---

## Phase 4: Deploy & Demo Prep

### EJ (Frontend)
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Performance profiling, fix any rendering issues
- [ ] Deploy frontend to Vercel, set `VITE_API_URL` to production backend
- [ ] Verify full flow on deployed version
- [ ] Bug fixes from production testing, final visual adjustments
- [ ] Ensure pre-generated worlds load smoothly

### Matt (Backend)
- [ ] Deploy backend to Railway/Render
- [ ] Configure production environment variables
- [ ] Test WebSocket connectivity over HTTPS
- [ ] Stress test voice pipeline on production
- [ ] Monitor API usage/credits, add request logging
- [ ] Bug fixes, verify all API integrations work in production

### Both
- [ ] Write demo script: exact flow for presentation, talking points for judges
- [ ] Practice demo transitions together
- [ ] Identify backup plans for each potential failure point

---

## Phase 5: Final

### Both
- [ ] Fix remaining bugs, polish animations
- [ ] Prepare backup demo plan (recorded video of working flow)
- [ ] Update README with project description + screenshots
- [ ] Final rehearsal on production
- [ ] Verify pre-generated worlds still load
- [ ] Test voice pipeline reliability
- [ ] Clear conversation state for clean demo
- [ ] **Present / Submit**

---

## Risk Mitigation

| Risk | Mitigation | Fallback |
|------|------------|----------|
| World Labs generation too slow | Use Marble 0.1-mini (30–45s) for live demo; use 0.1-plus for pre-generated showcase worlds | Pre-generate all demo worlds, never generate live |
| World Labs free tier runs out (4/month) | Buy credits early ($5 min). Test with 1 world, save rest for demo | Pre-generate worlds before hackathon starts |
| Gradium API down or flaky | Test early, report issues to support | Text input fallback — type instead of speak, display Gemini text instead of TTS |
| SparkJS fails to render | Prototype early, catch issues fast | Display World Labs panorama image as static background |
| Voice latency >3 seconds | Optimize chunk sizes, use streaming, show transcript while audio loads | Acceptable for demo if transcript appears fast |
| Gemini rate limits hit | Cache responses for repeated queries | Reduce function calling frequency |
| WebSocket drops during demo | Auto-reconnect logic in frontend + backend | Refresh page (fast with pre-generated worlds) |

---

## MVP Cut List (If Behind Schedule)

Cut in this order (last item cut first):

1. Facts overlay
2. Music crossfade transitions (just hard-switch tracks)
3. Loading experience visual enhancements (keep narration, drop fancy visuals)
4. Time selector scroll animation (use a simple dropdown instead)
5. react-globe.gl tile engine (fall back to static Earth texture — still has click-to-coordinate + markers)

**Never cut:**
- Voice pipeline (Gradium + Gemini) — this IS the project
- World Labs generation + SparkJS rendering — this IS the wow factor
- Landing page — first impression for judges
