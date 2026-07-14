# Changelog

All notable changes to this project will be documented in this file.

Each entry includes what changed, why it was changed, and which files were affected.

---

## [Session 25] - 2026-02-08

### Fixed
- **World Labs model still running mini despite service change** — The default in `world_labs.py` was updated to `Marble 0.1-plus`, but the frontend's REST endpoint uses `GenerateRequest` Pydantic model in `worlds.py` which had its own default of `Marble 0.1-mini`. Since the frontend doesn't send a `model` field, Pydantic filled in `mini`, overriding the service default. Fixed the Pydantic default too.
  - `backend/routers/worlds.py`
  - `backend/services/world_labs.py`

---

## [Session 24] - 2026-02-08

### Fixed
- **TTS not producing audio in exploring phase (async Gemini streaming)** — `generate_content_stream` was called synchronously (`for chunk in response`), blocking the asyncio event loop while waiting for each Gemini chunk. This prevented the TTS audio forwarding task from running concurrently, causing audio to pile up or never reach the frontend. In exploring phase with image attachments, Gemini takes significantly longer per chunk, making this blocking fatal. Switched to `client.aio.models.generate_content_stream()` with `async for` so TTS forwarding runs concurrently.
  - `backend/services/gemini_guide.py`
- **Gemini generating only tool calls with no spoken text in exploring** — Despite prompt instructions, Gemini with `mode="AUTO"` sometimes generates only `generate_fact` calls with zero spoken text when an image is attached. Added a safety net: after the function call loop, if `full_response_text` is empty, a system message forces Gemini to produce 1-2 spoken sentences (no tools). Guarantees the user always hears a voice response.
  - `backend/routers/voice.py`
- **Explore track music not found (silent second phase)** — If Deezer only matched 1 of 5 song suggestions, no explore track was sent. Frontend had no music for the exploring phase. Added: (1) broader fallback searches using region + era keywords, (2) last-resort reuse of loading track for both phases so exploring is never silent.
  - `backend/routers/voice.py`

### Changed
- **Song suggestions increased from 5 to 7** — More suggestions give Deezer more chances to find two distinct tracks (loading + exploring), especially for obscure regions.
  - `backend/services/gemini_guide.py`

---

## [Session 23] - 2026-02-08

### Added
- **Merged EJ's devpost branch (`ej/devpost`) into development-v4** — Brings in DevPost submission writeup, hyperspace whoosh SFX, and jump duration tuning (5s → 4s). Auto-merged cleanly with no textual conflicts.
  - `devpost.md` (new)
  - `frontend/public/sfx/BIG LONG WHOOSH SOUND EFFECT __ SOUND FX.mp3` (new)
  - `frontend/src/App.tsx` (SFX playback logic)
  - `frontend/src/components/HyperspaceCanvas.tsx` (jump duration 5000 → 4000ms)

### Fixed
- **Re-added `userProfile` selector after merge** — EJ's branch removed `const userProfile = useAppStore((s) => s.userProfile)` from App.tsx, but our `sendExploreStart` effect (Phase 2 exploring) still references it. Re-added to prevent build failure.
  - `frontend/src/App.tsx`

---

## [Session 22] - 2026-02-08

### Fixed
- **AI not speaking in exploring phase (facts only, no voice)** — Session 21's aggressive "ALWAYS call generate_fact" prompt caused Gemini to treat facts as the entire response, generating only function calls with no spoken text. The function call loop continued to round 2 but Gemini produced minimal/no text follow-up. Fix: reworded prompt to make spoken text explicitly the PRIMARY output ("you MUST generate spoken text in every response") with facts as supplementary ("alongside your spoken words, call generate_fact 1-2 times"). Added "CRITICAL: Never respond with only function calls and no spoken text."
  - `backend/services/gemini_guide.py`

---

## [Session 21] - 2026-02-08

### Fixed
- **Subtitle flash (full text appearing before word-by-word streaming)** — Session 20's guideText fallback accumulated all text into `guideSubtitle` before TTS audio started. When word-by-word kicked in, it would reset to word 1 — visible as a 0.2s flash of full text. Removed the fallback; word-by-word via TTS timestamps is the only subtitle path again.
  - `frontend/src/hooks/useVoiceConnection.ts`

### Added
- **UserSpeakingIndicator in exploring phase** — The voice-modulating pill that grows/shrinks with mic level was only rendered in globe phase (`showGlobeUI`). Added it to the exploring phase JSX so it appears during 3D world exploration too.
  - `frontend/src/App.tsx`

### Changed
- **Expanded fact categories (5 → 15)** — Added science, architecture, food, nature, trade, religion, warfare, medicine, music, language to the `generate_fact` tool's category enum. Gives Gemini more variety for overlay fact cards.
  - `backend/services/gemini_guide.py`

- **Boosted fact generation frequency** — Changed EXPLORING_PROMPT from "aim for 1-2 facts when relevant" to "ALWAYS call generate_fact at least once per response — ideally 2-3 times." Facts are a core visual feature and should fire consistently during exploration.
  - `backend/services/gemini_guide.py`

---

## [Session 20] - 2026-02-08

### Changed
- **Removed spacebar push-to-talk (mic always on)** — Spacebar feature was unreliable: trailing STT words after release killed AI responses, and mute state sync had repeated issues across Sessions 17-19. Reverted to always-on mic. Removed spacebar keydown/keyup listeners, set `_muted = false`, removed `setMuted` method and mute-state sync after `capture.start()`. Can revisit push-to-talk in the future.
  - `frontend/src/audio/VoiceConnection.ts`
  - `frontend/src/hooks/useVoiceConnection.ts`

### Fixed
- **Pillbox (GuideSubtitle) not appearing in exploring phase** — The word-by-word subtitle system (TTS timestamps + audioPlaybackStart) worked in globe phase but failed silently in exploring. Instead of continuing to debug the timestamp pipeline, added a direct fallback: the `guideText` handler now sets `guideSubtitle` directly from Gemini's streaming text chunks when `_subtitleAudioStart` is 0 (word-by-word hasn't started). This guarantees the pillbox shows as soon as text arrives. If/when TTS audio starts and word-by-word kicks in, it takes over seamlessly.
  - `frontend/src/hooks/useVoiceConnection.ts`

---

## [Session 19] - 2026-02-08

### Fixed
- **Spacebar release killing AI response** — Root cause: the transcript handler in VoiceConnection.ts performed barge-in interrupt on ANY transcript while TTS was playing, with no regard for mic muted state. When the user released spacebar (muting mic), trailing STT words still buffered in Gradium's pipeline would arrive as transcript events. The handler saw `playback.isPlaying === true` → killed playback → sent interrupt to backend → response dead. It also called `emit("responseStart")` which cleared the subtitle state. Fix: gated both the `responseStart` emission and the barge-in interrupt on `!this._muted` — only interrupt if the mic is actively unmuted (spacebar held). Trailing transcripts after spacebar release are logged but ignored for barge-in.
  - `frontend/src/audio/VoiceConnection.ts`

- **Pillbox (GuideSubtitle) not appearing in exploring phase** — The component was already rendered in App.tsx (line 323) during exploring phase. The issue was the spacebar transcript interrupt (above) killing responses before word timestamps and audio could populate the subtitle state. With the mic always on (Session 17 bug) or trailing STT words interrupting (this fix), `audioPlaybackStart` never fired, so `_subtitleAudioStart` was never set, so the 50ms polling in GuideSubtitle never revealed any words. No code change needed — fixing the transcript barge-in resolves this.

### Notes
- The distinction: user holding spacebar + speaking while AI talks = valid barge-in (interrupt). User releasing spacebar while AI talks = trailing STT words, not new speech (ignore).
- GuideSubtitle was always in the exploring phase JSX — the user thought it was missing code, but the real issue was state never being populated due to constant interrupts.

---

## [Session 18] - 2026-02-08

### Fixed
- **Spacebar push-to-talk not working (mic always on)** — Root cause: `capture.start()` creates a new `MediaStream` with `track.enabled = true` (browser default). The `_muted = true` state on VoiceConnection was never synced to this new stream, so the mic was always live despite push-to-talk being implemented. Fix: added `this.capture.setMuted(this._muted)` after `capture.start()` completes, ensuring every new connection starts muted. This also fixes the pillbox not appearing in exploring phase — with mic always on, ambient speech triggered constant barge-in interrupts via STT, cancelling TTS before `audioPlaybackStart` could fire, so subtitles never populated.
  - `frontend/src/audio/VoiceConnection.ts`

- **AI over-describing visuals in exploring phase** — Two conflicting instructions: the `EXPLORING_PROMPT` said "don't describe unless asked" but the seeded message in the `explore_start` handler said "describe what they can see." The seeded message overrode the system prompt, causing Gemini to physically describe colors, lighting, and textures on every response. Fix: (1) Changed seeded message from "describe what they can see" to "Welcome them warmly to this historical moment." (2) Rewrote EXPLORING_PROMPT instruction #3 to distinguish between RECOGNIZING (identifying landmarks/objects — desired) and DESCRIBING (colors, textures, visual composition — undesired).
  - `backend/routers/voice.py`
  - `backend/services/gemini_guide.py`

### Notes
- The spacebar fix is a one-liner but was the root cause of two user-facing bugs (mic always on + pillbox missing in exploring). The MediaStream `track.enabled` default is a subtle browser API gotcha.
- Visual prompt fix: the seeded message in explore_start is the first thing Gemini "hears" in the exploring phase, so it had more influence than the system prompt instruction. Removing the conflicting directive resolves the over-description.

---

## [Session 17] - 2026-02-08

### Added
- **Push-to-talk with spacebar** — Hold spacebar to unmute mic, release to mute. Mic is muted by default so the team can talk over the AI during demos without triggering STT. Muting uses `MediaStreamTrack.enabled` so the AudioWorklet receives silence (not dropped chunks) — this keeps VAD working so turns fire correctly after user speech ends.
  - `frontend/src/audio/AudioCaptureService.ts` (added `setMuted()` — toggles track.enabled)
  - `frontend/src/audio/VoiceConnection.ts` (added `_muted` flag, `setMuted()` forwards to capture)
  - `frontend/src/hooks/useVoiceConnection.ts` (spacebar keydown/keyup listeners)

- **Music queue: loading track + explore track** — Backend now finds TWO songs from Deezer suggestions: first plays during loading, second plays when entering the 3D world. Crossfades between tracks on phase transition.
  - `backend/routers/voice.py` (select_music finds two tracks, sends `exploreTrackUrl`)
  - `frontend/src/audio/VoiceConnection.ts` (MusicMessage extended with explore fields)
  - `frontend/src/hooks/useVoiceConnection.ts` (stores explore track URL on music event)
  - `frontend/src/store.ts` (added `exploreTrack` field)
  - `frontend/src/App.tsx` (crossfade to explore track on phase change)

### Changed
- **Exploring prompt: no unsolicited visual descriptions** — Updated EXPLORING_PROMPT so Gemini only describes what it sees in the canvas frame when the user explicitly asks about their view (e.g. "what's that building"). Previously, every response included visual descriptions because the prompt said "image attached = user asking about visuals."
  - `backend/services/gemini_guide.py`

### Fixed
- **Pillbox (GuideSubtitle) not appearing in exploring view** — Race condition: when `disconnect()` closed the old WebSocket, the async `onclose` handler fired AFTER the new `connect()` created a fresh AudioContext, destroying it via `cleanup()`. This killed TTS playback, so `audioPlaybackStart` never fired, so `_subtitleAudioStart` was never set, so the subtitle polling never revealed words, so `guideSubtitle` stayed empty, so the pillbox returned null. Fix: null out `onclose`/`onerror`/`onmessage` handlers before calling `ws.close()` in `disconnect()`.
  - `frontend/src/audio/VoiceConnection.ts`

---

## [Session 16] - 2026-02-08

### Added
- **Voice reconnection in exploring phase** — Voice pipeline now reconnects when entering the 3D world exploration phase, giving a fresh 300s Gradium session. Frontend sends `explore_start` with Phase 1 context (user profile, world description, location, time period) to seed Gemini with conversation continuity. AI auto-narrates a welcome when the world loads.
  - `frontend/src/App.tsx`
  - `frontend/src/audio/VoiceConnection.ts`
  - `frontend/src/hooks/useVoiceConnection.ts`
  - `backend/routers/voice.py`

- **FactsPanel component** — Glassmorphic fact overlay cards on the left side of the screen during exploration. Facts slide in with animation, show color-coded category labels, auto-dismiss after 15 seconds, max 4 visible. Same backdrop-blur styling as GuideSubtitle.
  - `frontend/src/components/FactsPanel.tsx` (NEW)
  - `frontend/src/hooks/useVoiceConnection.ts` (wired `fact` event to store)

- **"What am I looking at?" visual query** — Canvas frame capture system for Gemini vision. During exploring phase, every Gemini request includes a JPEG snapshot of the current 3D view. Backend sends `request_frame` to frontend, frontend captures canvas via `toDataURL`, sends back as base64, backend includes as `inline_data` image part in Gemini conversation. Works for any question, not just explicit visual queries.
  - `frontend/src/components/WorldExplorer.tsx` (preserveDrawingBuffer + captureWorldFrame)
  - `frontend/src/store.ts` (captureWorldFrame field)
  - `frontend/src/audio/VoiceConnection.ts` (sendFrame, request_frame handler)
  - `frontend/src/hooks/useVoiceConnection.ts` (requestFrame event wiring)
  - `backend/routers/voice.py` (frame_event/frame_holder, request_frame flow)
  - `backend/services/gemini_guide.py` (image_part parameter in generate_response)

- **Exploring phase Gemini prompt** — Dedicated `EXPLORING_PROMPT` that includes user profile and world description from Phase 1. Instructs Gemini to act as a tour guide, share facts via `generate_fact`, and describe visual details from attached images.
  - `backend/services/gemini_guide.py`

### Changed
- **GuideSubtitle now rendered during exploring** — Same word-by-word TTS-synced subtitle pill displayed during 3D exploration, not just globe phase.
  - `frontend/src/App.tsx`

### Fixed
- **Visual query frame capture reliability** — Frame capture for Gemini vision was failing because the request/response pattern timed out (audio messages flood the WebSocket). Fix: frontend now proactively sends canvas frames whenever user speech is detected (on transcript events), so the backend always has a recent frame. Backend uses the stored frame as fallback if the explicit request times out.
  - `frontend/src/hooks/useVoiceConnection.ts`
  - `backend/routers/voice.py`

---

## [Session 15] - 2026-02-08

### Fixed
- **WorldExplorer "collapse to a point" artifact** — Localized pinch/collapse in the rendered Gaussian splat world caused by float16 quantization. SparkRenderer was added directly to the scene (`scene.add(spark)`), meaning its origin was at `(0,0,0)`. SparkJS uses float16 internally for splat positions relative to the SparkRenderer origin, so distant splats lost precision and collapsed. Fix: moved SparkRenderer to be a child of the camera (`camera.add(spark)`) per SparkJS docs, so precision is always highest near the viewpoint. Also enabled `sort360: true` to prevent behind-camera culling artifacts when orbiting 360° around the world.
  - `frontend/src/components/WorldExplorer.tsx`
- **Camera spawns facing away from artifact** — Flipped initial camera Z offset so the world loads with the camera on the opposite side, hiding the collapse artifact from the default view.
  - `frontend/src/components/WorldExplorer.tsx`

---

## [Session 14] - 2026-02-08

### Changed
- **WorldExplorer renderer rewritten from scratch** — Complete rewrite to fix severe frame rate issues and "collapsed ball of light" artifact. Root causes: `gl.readPixels()` GPU sync in render loop, per-frame scene traversal to find auto-created SparkRenderer, ~200 lines of always-active debug instrumentation, retroactive SparkRenderer configuration, and full-resolution splat loaded by default. New implementation creates SparkRenderer explicitly at init with all config (eliminates per-frame traversal), removes all render-loop debug overhead, prefers 500k splat resolution for balanced quality/perf, and drops unnecessary collider mesh loading. Reduced from 520 lines to 263 lines.
  - `frontend/src/components/WorldExplorer.tsx`

---

## [Session 13] - 2026-02-08

### Fixed
- **Drop "CE" suffix for modern years on loading screen** — `formatYear()` now omits "CE" for years > 1300 (implied for modern dates). Years 1–1300 still show "CE", negative years still show "BCE".
  - `frontend/src/components/LoadingOverlay.tsx` — Added early return `if (year > 1300) return String(year)`

- **Voice stutter / double-turn-firing** — Fixed bug where AI response would start, cut off, then restart from scratch. Root cause: the `turn_ready` VAD flag was sticky and could re-arm during an active response when late STT words reset the debounce timer. Added three guards: (1) `turn_fired_at` timestamp prevents `turn_ready` from re-arming within 2s of last fire, (2) late STT words arriving within 1.5s of a fired turn don't reset `last_stt_word_at`, (3) `turn_fired_at` set on every turn dispatch.
  - `backend/routers/voice.py` — Added `turn_fired_at` variable, gated `turn_ready` re-arming, guarded late STT word debounce reset

- **WorldExplorer "bulb" rendering artifact** — Collider mesh from World Labs was being rendered as a translucent wireframe (opacity 0.08), overlapping the Gaussian splat world and creating a visible artifact when zooming. Collider meshes are "coarse mesh optimized for simple physics calculations" (per World Labs docs) and should not be visible. Set `visible = false` on collider mesh children instead.
  - `frontend/src/components/WorldExplorer.tsx` — Replaced wireframe material modification with `child.visible = false`; confirmed quaternion `(1,0,0,0)` is correct OpenCV→OpenGL coordinate flip per SparkJS docs; verified SparkRenderer config (`clipXY=1.4`, `minAlpha`, `maxStdDev`) matches SparkJS defaults

---

## [Session 12] - 2026-02-07

### Changed
- **Merged frontend-v3 + ej/worldlabs → development-v3** — Combined Deezer music pipeline, loading messages, transition flow, and star fixes from frontend-v3 with EJ's WorldExplorer SparkJS Gaussian splat renderer, enhanced World Labs asset extraction, and world generation endpoints. Resolved conflicts in App.tsx, store.ts, voice.py, world_labs.py, worlds.py, package.json.
  - `frontend/src/App.tsx` — frontend-v3 transition flow + EJ's WorldExplorer + world generation
  - `frontend/src/store.ts` — Both `loadingMessages`/`transitionComplete` and `WorldRenderableAssets`
  - `backend/routers/voice.py` — Deezer/transition base + EJ's enhanced `_poll_world_and_notify`
  - `backend/services/world_labs.py` — EJ's superset with `extract_renderable_assets()`, `fetch_operation()`
  - `backend/routers/worlds.py` — EJ's enhanced status endpoints + `/hardcoded/start`
  - `frontend/src/components/WorldExplorer.tsx` — NEW: 531-line SparkJS Gaussian splat renderer
  - `frontend/src/components/WorldExplorer.css` — NEW: WorldExplorer styles
  - `frontend/src/utils/worldGeneration.ts` — NEW: World generation + REST polling utility
  - `frontend/package.json` — Added `@sparkjsdev/spark` dependency

- **Dynamic world generation from AI description** — Replaced hardcoded prompt (`backend/hardcoded_prompt.txt`) with dynamic `world_description` from Gemini's `summarize_session` tool call. When user confirms exploration, Gemini generates a rich 8-12 sentence scene description. During loading phase, frontend sends this description to `/api/worlds/generate` → World Labs creates a 3D world from it → WorldExplorer renders it.
  - `frontend/src/utils/worldGeneration.ts` — Renamed `generateWorldFromHardcodedPrompt()` → `generateWorld(sceneDescription)`, hits `/api/worlds/generate` instead of `/api/worlds/hardcoded/start`, polls `/api/worlds/status/{id}` instead of `/api/worlds/hardcoded/status/{id}`
  - `frontend/src/App.tsx` — Reads `worldDescription` from store, passes to `generateWorld()` in loading phase useEffect; waits for `worldDescription` to be set before triggering generation

---

## [Session 11] - 2026-02-07 18:30

### Added
- **Deezer music integration (replacing Spotify)** — Spotify developer dashboard not accepting new apps, so replaced entire Spotify stack with Deezer. Deezer's `GET /search` API requires zero authentication and returns 30-second MP3 preview URLs that HTML5 Audio plays directly. Net effect: ~540 lines deleted, ~50 lines added.
  - `backend/services/deezer_service.py` — New stateless service: `search_tracks(query, limit)` → `[{preview_url, title, artist, album_art}]`
  - `backend/services/spotify_service.py` — DELETED
  - `backend/routers/spotify.py` — DELETED
  - `frontend/src/audio/SpotifyService.ts` — DELETED
  - `frontend/src/components/SpotifyConnect.tsx` — DELETED
  - `backend/main.py` — Removed Spotify router import/mount
  - `backend/config.py` — Removed `SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI`
  - `frontend/src/store.ts` — Removed `spotifyConnected` state

- **Song suggestion system for Deezer** — Instead of genre-style search queries (which often returned 0 Deezer results), Gemini now picks 5 real song names with artists (e.g. "Take Five - Dave Brubeck", "Clair de Lune - Debussy") that fit the era/region/mood. Backend iterates through the list until Deezer finds a match. Verified: Deezer has full mainstream catalog (Queen, Debussy, Brubeck, etc.).
  - `backend/services/gemini_guide.py` — `_SELECT_MUSIC` tool: replaced `search_query` (STRING) with `song_suggestions` (ARRAY of 5 strings)
  - `backend/routers/voice.py` — `select_music` handler: iterates `song_suggestions`, searches Deezer for each until match, falls back to local tracks

- **Music fade transition** — When user confirms exploration, ambient globe music fades out to silence (2s). Brief silence gap. Then Deezer era-specific track fades in from silence (2s). Creates a clean audio transition instead of abrupt crossfade.
  - `frontend/src/App.tsx` — Added `musicService.stop(2000)` in `confirmRequested` effect
  - `frontend/src/hooks/useVoiceConnection.ts` — Changed music handler from `crossfadeTo` to `play` with `fadeInMs: 2000`

- **TTS-aware music queueing** — Music no longer cuts off AI mid-sentence. When Deezer track arrives while TTS is still playing buffered audio, music waits (polls every 200ms) until TTS drains, then fades in. AI finishes naturally, brief silence, then music.
  - `frontend/src/audio/VoiceConnection.ts` — Added `isTTSPlaying` public getter exposing `AudioPlaybackService.isPlaying`
  - `frontend/src/hooks/useVoiceConnection.ts` — Music handler polls `vc.isTTSPlaying` before starting playback

- **Downloaded royalty-free ambient music tracks** — Sourced and downloaded tracks for the local music fallback library
  - `frontend/public/music/ambient-globe.mp3` — Ambient background for globe phase
  - `frontend/public/music/ancient-mediterranean.mp3`
  - `frontend/public/music/ancient-egypt.mp3`
  - `frontend/public/music/medieval-europe.mp3`
  - `frontend/public/music/modern-cinematic.mp3`
  - `frontend/public/music/dramatic-epic.mp3`

- **AI-generated loading messages** — Backend sends 15 personalized loading messages via `generate_loading_messages` tool call. Frontend displays them rotating every 4 seconds. Simple "Preparing your journey" placeholder until AI messages arrive.
  - `backend/services/gemini_guide.py` — Added `_GENERATE_LOADING_MESSAGES` tool declaration
  - `backend/routers/voice.py` — Added `generate_loading_messages` handler
  - `frontend/src/components/LoadingOverlay.tsx` — Displays rotating messages, 4s interval

- **Subtitle sync system** — Word-level timestamps from TTS enable synced subtitle reveal. Frontend tracks `wordTimestamps` and `subtitleAudioStartTime` to reveal words in time with audio playback.
  - `frontend/src/audio/VoiceConnection.ts` — Emits `wordTimestamp` and `audioPlaybackStart` events
  - `frontend/src/hooks/useVoiceConnection.ts` — Wires events to store (`addWordTimestamp`, `markSubtitleAudioStart`)

### Fixed
- **Disconnect race condition on confirm** — `transitionComplete` effect checked `phase === 'globe'` but phase was already `'loading'` (set by `handleJumpComplete`), so voice never disconnected. Removed the phase check — disconnect fires on `transitionComplete` regardless of phase.
  - `frontend/src/App.tsx`

- **Gemini not calling tools during transition** — With default `mode=AUTO`, Gemini could skip tool calls (summarize_session, loading_messages, select_music) and just generate text. Added `tool_config` with `FunctionCallingConfig(mode="ANY")` for transition phase, forcing at least one tool call.
  - `backend/services/gemini_guide.py` — `_build_config()` sets `mode="ANY"` when `phase == "transition"`

- **37-second TTS narration blocking transition** — After transition tool calls, the follow-up Gemini loop generated a massive narration in round 2. Then entire decision changed: no voice response should happen during transition at all. Two fixes: (1) break after first Gemini round in transition phase, (2) skip TTS stream creation entirely during transition (`is_transition` flag), (3) discard all text chunks during transition.
  - `backend/routers/voice.py` — `is_transition` flag skips TTS creation, discards text chunks, breaks after first round

- **Deezer search returning 0 results** — Two layered issues: (1) `search_query` was optional in tool declaration — Gemini skipped it with `mode=ANY`. Fixed by adding to `required` list. (2) Gemini generated overly specific queries like "1930s New York city bustling orchestral jazz instrumental" which returned 0 Deezer results. Fixed with progressive query simplification retry loop, then replaced entirely with song suggestions approach.
  - `backend/services/gemini_guide.py` — Made `search_query` required, then replaced with `song_suggestions`
  - `backend/routers/voice.py` — Progressive simplification, then replaced with song iteration

- **Stars jumping/jittering on state changes** — tsParticles `Particles` component re-rendered on every parent state change (keypresses in LandingWarp, voice state in App), causing particle positions to reset. Three fixes: (1) Removed `density: { enable: true }` from particle options (prevented recalculation on resize), (2) Wrapped `GlobeStarfield` in `React.memo` (prevents re-renders from App state), (3) Extracted `StableStarfield` memoized sub-component from `LandingWarp` (prevents re-renders from keypress state).
  - `frontend/src/components/starfieldOptions.ts` — Removed `density: { enable: true }`
  - `frontend/src/components/GlobeStarfield.tsx` — Wrapped export with `memo()`
  - `frontend/src/components/landing/LandingWarp.tsx` — Extracted `StableStarfield = memo(...)` component outside parent

- **Loading overlay showing "Gathering supplies for..."** — User explicitly didn't want this fallback text. Removed `fallbackPhrases()` function entirely. Simple "Preparing your journey" placeholder until AI-generated messages arrive. Reduced rotation interval from 7s to 4s.
  - `frontend/src/components/LoadingOverlay.tsx`

### Changed
- **MusicService error logging** — Added `audio.onerror` handler and success log on crossfade play for debugging Deezer preview URL issues
  - `frontend/src/audio/MusicService.ts`

- **VoiceConnection MusicMessage type** — Changed source union from `"local" | "spotify"` to `"local" | "deezer"`, removed `spotifyUri` field
  - `frontend/src/audio/VoiceConnection.ts`

- **Confirm exploration prompt** — Updated system instruction: removed spoken goodbye request, added `song_suggestions` format description, emphasized "Do NOT generate any text outside of tool calls"
  - `backend/routers/voice.py`

### Notes
- Deezer free API returns full mainstream catalog (Queen, Dave Brubeck, Debussy all confirmed). 30-second MP3 previews play via HTML5 `new Audio(url)` with no auth.
- `mode=ANY` in Gemini tool_config forces tool calls but suppresses text output — this is the desired behavior for transition phase (tools only, no speech).
- The `is_transition` flag approach for skipping TTS reduced transition time from ~37s to ~3-5s.
- Stars fix required both memoization (prevent re-renders) AND density removal (prevent recalculation). Either alone was insufficient.

---

## [Session 10] - 2026-02-07 17:15

### Fixed
- **Enter key not triggering hyperspace warp** — Two issues: (1) keyboard listeners used bubbling phase, but globe.gl's Three.js OrbitControls calls `stopPropagation()` on keyboard events, preventing them from reaching `window`. Fixed by switching to capture phase (`true`). (2) The `release()` function had a 300ms hold threshold from the original CodePen — a quick tap silently aborted the jump. Removed the threshold so any Enter press+release triggers the warp.
  - `frontend/src/App.tsx`
  - `frontend/src/components/HyperspaceCanvas.tsx`

---

## [Session 9] - 2026-02-07 17:00

### Added
- **HyperspaceCanvas radial starfield + warp component** — Ported the vanilla JS JumpToHyperspace CodePen animation into a React + TypeScript component. Stars radiate outward from screen center and grow as they travel. Three visual states: idle (calm radial drift), initiating (hold Enter — star tails freeze, lines stretch), jumping (release Enter — velocity spikes, blue warp tunnel). Uses a custom rAF-based tween system instead of GreenSock TweenMax to avoid adding a heavy dependency. Exposes imperative API via forwardRef: `initiate()`, `release()`, `reset()`. Jump duration set to 5 seconds per spec.
  - `frontend/src/components/HyperspaceCanvas.tsx`
- **Globe fade-out CSS class** — Added `.globe-fade-out` with 200ms opacity transition for smooth globe exit during hyperspace jump
  - `frontend/src/index.css`
- **Hold-Enter keyboard handling for hyperspace** — Global keydown/keyup listeners (active only during globe phase, skipped when typing in inputs) trigger the initiate-on-hold / jump-on-release flow, with a local `warpState` to manage globe visibility and UI control hiding during warp
  - `frontend/src/App.tsx`

### Changed
- **Replaced tsParticles Starfield with HyperspaceCanvas behind globe** — The tsParticles-based `Starfield.tsx` was removed and replaced with the new canvas-based `HyperspaceCanvas` that renders the radial star animation behind the globe. tsParticles remains only in the landing page (`LandingWarp.tsx`).
  - `frontend/src/App.tsx`
- **App phase management expanded** — Added `warpState` local state (`idle` | `initiating` | `jumping`) to control globe fade-out, UI control visibility during warp, and transition to `loading` phase when jump completes. HyperspaceCanvas also renders during `loading` phase (idle starfield, no globe).
  - `frontend/src/App.tsx`

### Removed
- **Starfield.tsx (tsParticles globe background)** — No longer needed; replaced by the canvas-based HyperspaceCanvas for the globe background
  - `frontend/src/components/Starfield.tsx`

### Notes
- The original CodePen animation used TweenMax for smooth value tweening; replaced with a lightweight linear interpolation driven by requestAnimationFrame
- Template literal backticks were missing from the provided code's `rgba()` calls — fixed during port
- lodash debounce for resize replaced with native setTimeout debounce
- Canvas uses `pointer-events: none` so globe interaction passes through
- Landing page starfield (LandingWarp) is unaffected — still uses tsParticles independently

---

## [Session 8] - 2026-02-07 16:45

### Changed
- **Glassmorphic beacon marker replacing solid cylinder** — Removed the opaque polygon cylinder (`pointsData`) and built a custom Three.js beacon via `objectsData` + `objectThreeObject`. The beacon is a hollow open-ended tube with a custom GLSL shader: quadratic height-based alpha fade (solid at base, transparent at top), fresnel edge brightening for glass refraction illusion, additive blending for natural glow, double-sided rendering so the hollow center is visible. Includes a soft base glow disc (RingGeometry with additive blend) and a faint inner core glow line. Slight top-to-bottom taper for visual interest.
  - `frontend/src/components/Globe.tsx`
- **Enhanced ring ripples** — Replaced single ring with triple-layer concentric ripples at different speeds and radii (3.5/5.5/8 maxR, staggered repeat periods) for a richer pulsing effect around the beacon base
  - `frontend/src/components/Globe.tsx`

### Notes
- Used `objectsData` API (positions + orients automatically at lat/lng) instead of `customLayerData` (manual positioning) — much cleaner
- Three.js r182 confirmed available via react-globe.gl dependency
- Beacon mesh is cached and cloned per data-join for performance
- GLSL shaders defined as module-level constants to avoid re-creation

---

## [Session 7] - 2026-02-07 16:00

### Added
- **"Travel to..." pill with forward geocoding** — Dark glassmorphic pill sits above the location card. Click to enter a place name, press Enter to geocode via Nominatim, which moves the globe marker + camera and updates the location card. Escape or blur closes without action.
  - `frontend/src/components/TravelTo.tsx`
  - `frontend/src/utils/geocode.ts`
  - `frontend/src/App.tsx`

### Changed
- **LocationCard — dark glassmorphic styling, blue coordinates, pill shape** — Switched from light glass to dark glass (`rgba(0,0,0,0.45)` + blur), changed coordinate color from cyan to `#7db8ff`, bold Plus Jakarta Sans, rounded-full pill, increased padding
  - `frontend/src/components/LocationCard.tsx`
- **GlobeControls — dark glassmorphic buttons** — Matched Color/Labels buttons to the same dark glass style as the time-wheel pills
  - `frontend/src/components/GlobeControls.tsx`
- **Globe pin + ring color** — Changed from cyan `#00d4ff` to matching blue `#7db8ff`
  - `frontend/src/components/Globe.tsx`
- **Starfield particle tuning** — Reduced speed/size back to calm baseline, added rare shooting star streaks (3 particles, speed 3–8, long delay between spawns)
  - `frontend/src/components/Starfield.tsx`
  - `frontend/src/components/landing/LandingWarp.tsx`
- **Color mode brightness** — Reduced from 0.8 to 0.7 for a slightly dimmer, less washed-out globe
  - `frontend/src/index.css`

---

## [Session 6] - 2026-02-07 15:15

### Added
- **Animated starfield behind the globe** — Replaced the static dark radial gradient with a live tsParticles starfield matching the landing page aesthetic. The globe canvas is transparent so stars drift gently behind it, creating a cohesive "globe floating in space" look.
  - `frontend/src/components/Starfield.tsx` (new reusable component)
  - `frontend/src/index.css` (added `.starfield-bg` styles)
  - `frontend/src/App.tsx` (integrated Starfield inside `.globe-bg`)

### Notes
- Engine initialization is module-level guarded — safe even if both LandingWarp and Starfield mount (no double-init)
- Globe starfield uses slightly fewer particles (300 vs 380) and slower speed (0.5 vs 1.2) than the landing page for a calmer ambient feel that doesn't compete with the globe itself
- `pointer-events: none` on the starfield layer ensures it never interferes with globe interaction

---

## [Session 5] - 2026-02-07 15:00

### Changed
- **Globe auto-rotate speed increased** — Idle drift was too slow at 0.4; bumped to 0.8 for a more dynamic feel when not actively orbiting
  - `frontend/src/components/Globe.tsx`
- **Default tile mode changed to color** — Globe now opens in Voyager color mode instead of dark grayscale after the landing warp, making the first impression more vibrant
  - `frontend/src/store.ts`

---

## [Session 4] - 2026-02-07 14:30

### Fixed
- **Particles too slow/static** — Increased idle move speed from 0.3 to 1.2 and twinkle animation speed from 0.5 to 0.8 so the starfield feels alive instead of frozen
  - `frontend/src/components/landing/LandingWarp.tsx`
- **Keyboard input not registering** — Three root causes fixed: (1) tsParticles canvas was stealing pointer/keyboard focus, now has `pointer-events: none`; (2) overlay div now has `tabIndex={-1}` with auto-focus on mount and re-focus on click; (3) tsParticles interactivity events explicitly disabled in options
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`
- **Warp animation not working / not transitioning to globe** — CSS custom property inheritance was unreliable across browsers. Switched from setting `--warp-*` variables on the parent to direct inline `style.transform` / `style.filter` / `style.opacity` on individual DOM refs (`starsRef`, `vignetteRef`, `glowRef`, `flashRef`, `portalAreaRef`). Also added strict-mode guard on `initParticlesEngine` to prevent double initialization.
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`

### Notes
- Direct DOM manipulation (refs + inline styles) in the rAF loop is more reliable than CSS variable inheritance for cross-element animation
- `pointer-events: none` on the entire `.lw-stars` layer plus explicit `interactivity: { events: { onHover/onClick: false } }` ensures tsParticles never intercepts user input

---

## [Session 3] - 2026-02-07 14:00

### Added
- **Cinematic landing experience (LandingWarp)** — Implements the "hyperspace year entry" landing page: tsParticles starfield, glassmorphic portal, keyboard year input, and a Star Wars–style warp-to-globe transition. Phase machine (idle → collapse → warp → fade → done) runs in ~1.2s via rAF-driven CSS custom properties for GPU-accelerated blur/scale/brightness. Particles are nudged toward center each frame for genuine "star rush" effect. Supports prefers-reduced-motion (skip to fade). Micro-shake on empty Enter, caret blink, digit pop animation.
  - `frontend/src/components/landing/LandingWarp.tsx`
  - `frontend/src/components/landing/LandingWarp.css`
- **tsParticles dependencies** — `@tsparticles/react` and `@tsparticles/slim` for canvas-based starfield rendering
  - `frontend/package.json`

### Changed
- **App.tsx — Landing overlay integration** — Globe now renders underneath the landing overlay (pre-loading tiles in background). On warp completion, the chosen year is set in the selection store and phase transitions to 'globe', revealing the globe with UI controls. Clean handoff via `onComplete(year)` callback.
  - `frontend/src/App.tsx`
- **store.ts — Default phase changed to 'landing'** — App now starts with the cinematic landing experience instead of jumping directly to the globe
  - `frontend/src/store.ts`

### Notes
- Used CSS custom properties driven by rAF (not React state) for all warp animations to avoid re-renders and maintain 60fps
- Particle position manipulation via `container.particles.filter(() => true)` since the internal array is private in tsParticles v3
- Globe loads in background during landing phase so tiles are pre-cached when the warp fade reveals it
- Year input clamped to [1, 2026] silently per spec; selection store handles era/meta derivation

---

## [Unreleased]

### Added
- **Project documentation** — Establish shared understanding of scope, architecture, and execution plan before writing any code
  - `docs/PRD.md`
  - `docs/TECHNICAL.md`
  - `docs/ROADMAP.md`
  - `docs/CHANGELOG.md`

---

## [Session 10] - 2026-02-07

### Fixed
- **Gemini text formatting breaking TTS readability** — Gemini occasionally output text with newlines, ellipsis (`...`), and markdown formatting (asterisks, headers, backticks). TTS engines would skip lines or read formatting characters awkwardly. Two-part fix: (1) Added explicit "CRITICAL output rules" to the Gemini system prompt instructing plain spoken prose only — no markdown, no line breaks, no ellipsis, no special characters. (2) Added `_sanitize_for_tts()` function as a safety net that strips any formatting that slips through before text reaches TTS (collapses whitespace, removes markdown, replaces `...` with comma).
  - `backend/services/gemini_guide.py` — Added TTS output rules to `GUIDE_SYSTEM_PROMPT`
  - `backend/routers/voice.py` — Added `_sanitize_for_tts()` function, applied to text before `tts_stream.send_text()`

- **Sentence splitting under heavy barge-in** — When the user interrupted and spoke, their sentence was split into 2-3 separate turns (e.g. "No, no, you can tell me about Germany. Sorry, I interrupted you there before" became three turns). Root cause: after an interrupt, STT fragments arrive in bursts as the mic picks up both the tail of TTS audio and the user's actual speech. The standard 0.5s debounce was too short — fragments would pause just long enough to fire a premature turn. Fix: after a barge-in interrupt, use a longer debounce window (1.5s instead of 0.5s) for 3 seconds, giving the user time to finish their thought before a turn fires.
  - `backend/routers/voice.py` — Added `TURN_DEBOUNCE_AFTER_INTERRUPT_S = 1.5`, `INTERRUPT_DEBOUNCE_WINDOW_S = 3.0`, `last_interrupt_at` shared variable. Interrupt handler records timestamp. Debounced turn firing selects debounce duration based on time since last interrupt. Logs show which debounce mode was used.

### Changed
- **Archived frontend test UI and removed conflicting config for clean merge with EJ's frontend** — Since `frontend/` doesn't exist on `main`, both Matt's and EJ's branches add the entire directory. Any shared filenames (App.tsx, main.tsx, package.json, vite.config.ts, tsconfig.json, index.html) would conflict. Removed all files EJ will provide, archived Matt's test UI for reference, and kept only the unique voice pipeline files that won't conflict.
  - `frontend/src/App.tsx` → `frontend/src/_archived/TestApp.tsx` (archived)
  - `frontend/src/main.tsx` → `frontend/src/_archived/test-main.tsx` (archived)
  - `frontend/index.html` — Deleted (EJ provides)
  - `frontend/package.json` — Deleted (EJ provides)
  - `frontend/vite.config.ts` — Deleted (EJ provides; WS proxy config documented in integration notes)
  - `frontend/tsconfig.json` — Deleted (EJ provides)
  - `frontend/src/vite-env.d.ts` — Deleted (EJ provides)

### Added
- **Post-merge voice integration guide** — Created `docs/VOICE_INTEGRATION.md` documenting everything EJ needs to wire up Matt's voice pipeline into his frontend: Vite WS proxy config, React hook usage, event listeners for world/fact/music/location, context/phase sending, AudioWorklet serving requirements, and TypeScript config notes.
  - `docs/VOICE_INTEGRATION.md` — New file

---

## [Session 9] - 2026-02-07

### Added
- **Gemini integration analysis doc** — Created `docs/GEMINI_INTEGRATION.md` documenting the full voice pipeline flow, Gemini conversation history mechanics, function calling protocol, all 4 tool call definitions, and session state architecture. Written as reference for both team members.
  - `docs/GEMINI_INTEGRATION.md` — New file

- **Response isolation with responseId** — Added `responseId` tagging to `audio` and `guide_text` WebSocket messages. Backend sends `response_start` before each new response. Frontend tracks `activeResponseId` and drops audio/text from stale (cancelled) responses that are still in-flight in the WebSocket pipe. This prevents jumbled audio when rapidly interrupting — old audio chunks arriving after an interrupt are silently dropped instead of being played.
  - `backend/routers/voice.py` — Sends `{type: "response_start", responseId}` before each response. Tags `audio` and `guide_text` messages with `responseId`.
  - `frontend/src/audio/VoiceConnection.ts` — Added `activeResponseId` tracking. On `response_start`: sets active ID. On `audio`/`guide_text`: drops if `responseId` doesn't match active. On interrupt (frontend or backend): clears `activeResponseId` so all in-flight audio is rejected.

### Fixed
- **Function calls now produce voice responses** — When Gemini made a function call (e.g. `suggest_location`, `trigger_world_generation`), the function was executed but Gemini was never called again to generate the follow-up voice response. The guide would go silent after any tool use. Fixed by adding a function-call loop in `_process_gemini_response()`: after executing function calls and adding results to history, Gemini is called again (with `user_text=None`) to produce the natural language follow-up. Loop runs up to `MAX_FUNCTION_ROUNDS=3` to support chained calls.
  - `backend/routers/voice.py` — Wrapped Gemini streaming in a `for round_num in range(MAX_FUNCTION_ROUNDS + 1)` loop. Tracks `function_calls_this_round`; breaks on pure text response; continues with `input_text=None` after function calls.
  - `backend/services/gemini_guide.py` — Made `user_text` parameter optional (`str | None = None`). When `None`, skips appending a user message and calls Gemini with the existing history (which contains the function result from `add_function_result()`).

- **Graceful TTS teardown on interrupt** — Per Gradium best practices, now sends `end_of_stream` to TTS before closing the WebSocket on interrupt/cancellation. Previously just closed abruptly. The `end_of_stream` signal helps Gradium free the session faster, reducing concurrency limit issues during rapid interrupt cycles.
  - `backend/routers/voice.py` — `finally` block in `_process_gemini_response()` now calls `tts_stream.send_flush()` before `tts_stream.close()`

### Changed
- **Cleaned up debug logging in gemini_guide.py** — Replaced verbose `print()` statements with structured `logger.info()` and `logger.debug()` calls. Key milestones logged at INFO level, history dumps at DEBUG level.
  - `backend/services/gemini_guide.py` — All `print(f"[GEMINI_GUIDE]...")` → `logger.info/debug(...)`

---

## [Session 6/7/8] - 2026-02-07

### Added
- **Client-side voice activity detection for instant barge-in** — AudioWorklet now computes RMS energy on every audio frame. When voice is detected above threshold (0.015) while TTS is playing, the frontend immediately stops playback and sends an `interrupt` message to the backend. This is ~100ms latency vs 300-600ms for waiting on STT transcripts.
  - `frontend/public/audio-processor.js` — Added RMS computation, `VOICE_THRESHOLD=0.015`, `VOICE_COOLDOWN_MS=300`, posts `{type: "voice_activity", rms}` messages alongside PCM chunks
  - `frontend/src/audio/AudioCaptureService.ts` — Added optional `onVoiceActivity` callback parameter to `start()`. Distinguishes `ArrayBuffer` (PCM data) from `{type: "voice_activity"}` objects in worklet port messages
  - `frontend/src/audio/AudioPlaybackService.ts` — Added `isPlaying` getter (checks `scheduledSources.length > 0`) so VoiceConnection can detect when guide audio is active
  - `frontend/src/audio/VoiceConnection.ts` — Wired voice activity callback: when mic activity detected while `playback.isPlaying`, instantly calls `playback.interrupt()` and sends `{type: "interrupt"}` to backend

- **Backend frontend-interrupt handler** — Backend now processes `{type: "interrupt"}` messages from the frontend. When received, cancels any active Gemini/TTS response task immediately. Previously, interrupts could only come from STT-based barge-in detection.
  - `backend/routers/voice.py` — Added `elif msg_type == "interrupt"` handler in main WebSocket loop

- **Comprehensive logging across full pipeline** — Added detailed timestamped logging to trace every message through the pipeline. Enables debugging of timing issues between STT, VAD, Gemini, and TTS.
  - `backend/routers/voice.py` — `[timestamp][VOICE]`, `[timestamp][STT]`, `[timestamp][VAD]`, `[timestamp][GEMINI]`, `[timestamp][TTS]`, `[timestamp][FE→STT]`, `[timestamp][FE→BE]`, `[timestamp][WS→FE]` log prefixes. VAD logs show all qualifying horizons, buffer state, and trigger status. Turn counting. Session stats on disconnect.
  - `backend/services/gemini_guide.py` — Logs full conversation history dump before each Gemini call (role, parts summary for each entry), system prompt preview, input text, stream progress, chunk count, function calls
  - `frontend/src/audio/VoiceConnection.ts` — `[VC→BE]` outbound and `[BE→VC]` inbound logging with message sequence numbers, audio chunk counters, status transitions, cleanup stats

- **TTS retry with backoff for concurrency limits** — Gradium has a 2-session concurrency limit per API key, and closed sessions take time to free on their servers. When TTS creation fails with "Concurrencylimit exceeded", the backend now retries up to 3 times with 3-second delays instead of immediately falling back to text-only mode.
  - `backend/routers/voice.py` — `_process_gemini_response()` TTS creation wrapped in retry loop with `ConnectionError` detection for "Concurrencylimit" substring

### Fixed
- **Premature VAD turn detection splitting sentences** — Root cause: The 1.0s VAD horizon fires on brief inter-word pauses (~500ms between "the" and "world"), triggering a turn before the user finishes their sentence. The 2.0s horizon stays low (0.22) during these same gaps. Changed `VAD_MIN_HORIZON_S` from 1.0 to 2.0 and `VAD_INACTIVITY_THRESHOLD` from 0.5 to 0.7 so only sustained silence triggers a turn.
  - `backend/routers/voice.py` — `VAD_MIN_HORIZON_S = 2.0`, `VAD_INACTIVITY_THRESHOLD = 0.7`

- **False barge-in from trailing STT words** — Root cause: When VAD fires a turn, the STT pipeline still has words in flight. These arrive 0-150ms later and were treated as the user interrupting (barge-in), which cancelled the just-launched Gemini response. The late word then became its own broken turn with fragmentary text (e.g., "me all" instead of "Yeah, take me, tell me all about it"). Two-part fix:
  1. **Removed STT-based barge-in entirely** — Incoming STT transcripts during an active response no longer trigger cancellation. Barge-in is now handled exclusively by the frontend mic activity detection, which is faster and doesn't suffer from pipeline lag.
  2. **Debounced turn firing** — When VAD crosses the inactivity threshold, the turn is marked as "ready" but not immediately fired. It waits 500ms (`TURN_DEBOUNCE_S = 0.5`) for the STT pipeline to deliver any remaining words. Only after 500ms of no new STT words does the turn actually fire with the complete sentence.
  - `backend/routers/voice.py` — Added `TURN_DEBOUNCE_S = 0.5`, `turn_ready` flag, `last_stt_word_at` timestamp. Removed barge-in from STT transcript handler. Added debounced turn check after every STT message.

- **Gemini function call history not saved** — Root cause: `generate_response()` recorded model responses in conversation history with only `text` parts, ignoring `function_call` parts. When the model called `suggest_location`, the history entry was empty (`model:` with no parts), breaking Gemini's expected conversation flow (model function_call → user function_response → model text).
  - `backend/services/gemini_guide.py` — Model response history now includes both `types.Part(text=...)` and `types.Part(function_call=types.FunctionCall(name=..., args=...))` parts

- **TTS concurrency exhaustion from rapid barge-in cycles** — Root cause: False barge-in caused rapid create→cancel→create TTS session cycles. Each cancelled session took time to free on Gradium's servers, exhausting the 2-session limit. The debounced turn firing fix prevents most rapid cycles, and the TTS retry with backoff handles remaining cases.
  - `backend/routers/voice.py` — Combination of debounce fix (fewer cancellations) + retry logic (graceful recovery)

### Notes
- The debounced turn firing adds ~500ms latency to response start (waiting for STT to settle), but eliminates split sentences which caused much worse UX (broken turns, wasted Gemini calls, TTS session churn)
- Frontend mic activity detection provides faster interrupt response (~100ms) than the old STT-based barge-in (~300-600ms) since it operates directly on audio energy without waiting for speech recognition
- Gradium has no session management API — no way to list, kill, or reset sessions. Leaked sessions persist for 300 seconds before auto-expiring. The retry logic is the only mitigation.
- Gemini conversation history entry [4] in previous logs showed `model:` with empty parts — this was the function call history bug. Fixed entries now show `model: fn_call:suggest_location, text:"..."` correctly.
- AudioWorklet voice activity uses 300ms cooldown to prevent rapid-fire interrupt messages from continuous speech

---

## [Session 4/5] - 2026-02-07

### Added
- **Production voice pipeline client** — Built the production-grade browser audio layer for the voice pipeline. Uses AudioWorklet (not deprecated ScriptProcessorNode) for mic capture, gapless Web Audio API scheduling for TTS playback, and a framework-agnostic TypeScript architecture that EJ can integrate into the visual frontend.
  - `frontend/public/audio-processor.js` — AudioWorklet processor: 24kHz Float32→Int16 PCM, 1920-sample (80ms) chunks on the audio rendering thread
  - `frontend/src/audio/AudioCaptureService.ts` — Mic → AudioWorklet → PCM chunk callback. Creates 24kHz AudioContext (native Gradium STT rate, no resampling). Handles getUserMedia, AudioWorklet loading, GC-safe node refs
  - `frontend/src/audio/AudioPlaybackService.ts` — TTS PCM → gapless 48kHz speaker playback. Int16→Float32 conversion, AudioBufferSourceNode scheduling with `nextStartTime` tracking, interrupt support
  - `frontend/src/audio/VoiceConnection.ts` — WebSocket orchestrator: ties capture + playback to backend `/ws/voice` protocol. Handles all message types (audio, transcript, guide_text, fact, world_status, music, suggested_location). Event emitter pattern for framework-agnostic use
  - `frontend/src/hooks/useVoiceConnection.ts` — Thin React hook wrapping VoiceConnection. Exposes status, transcripts, guideTexts as React state. Lifecycle cleanup on unmount
  - `frontend/src/App.tsx` — Minimal one-button test UI: Connect/Disconnect + transcript/guide text log panels
  - `frontend/package.json` — Vite + React 19 + TypeScript 5.7
  - `frontend/tsconfig.json` — Strict mode, ES2022 target
  - `frontend/vite.config.ts` — React plugin + WebSocket proxy (`/ws` → `http://localhost:8000`)
  - `frontend/index.html` — HTML shell
  - `frontend/src/main.tsx` — React root mount
  - `frontend/src/vite-env.d.ts` — Vite type declarations

### Changed
- **TECHNICAL.md — Corrected API formats** — Fixed multiple documentation errors discovered during live API testing (Session 3/4)
  - `docs/TECHNICAL.md`
- **ROADMAP.md — Reordered Phase 2, checked off Phase 1 Backend** — All Phase 1 Backend tasks marked complete. Added new "Matt (Voice Client)" section to Phase 2 — audio pipeline work pulled forward from EJ's scope so the full voice round-trip is proven before EJ starts visual frontend. Milestone 1 marked complete (27/27 tests).
  - `docs/ROADMAP.md`
- **backend/main.py — Removed /test route** — Throwaway test page replaced by production frontend
  - `backend/main.py`

### Removed
- **backend/static/test.html** — Throwaway browser test page with ScriptProcessorNode (deprecated, had GC bugs in Chrome causing zero audio). Replaced by production AudioWorklet-based frontend
  - `backend/static/test.html`
  - `backend/static/` (directory removed)

### Notes
- AudioWorklet chosen over ScriptProcessorNode because: (1) ScriptProcessorNode is deprecated, (2) Chrome GC bug causes audio nodes to be collected even when connected, (3) AudioWorklet runs on a dedicated thread with lower latency
- 24kHz capture AudioContext matches Gradium STT native rate — no client-side resampling needed
- 48kHz playback AudioContext matches Gradium TTS native rate — no client-side resampling needed
- Frontend TypeScript type-checks clean (`tsc --noEmit`), Vite builds clean (201kB gzip: 63kB)
- Previous browser test page debugging identified 3 bugs: (1) getUserMedia permission dialog timing, (2) AudioContext suspended state, (3) ScriptProcessorNode GC. All avoided by AudioWorklet architecture

---

## [Session 3] - 2026-02-07

### Changed
- **ROADMAP.md — Renamed Person A/B to EJ/Matt** — Personalized team references now that roles are assigned.
  - `docs/ROADMAP.md`

### Added
- **Phase 1 Backend — Complete FastAPI scaffolding and voice pipeline** — Implemented all Phase 1 Backend tasks from the ROADMAP: project scaffolding, Gradium STT/TTS service, Gemini Guide service with function calling, World Labs service (stub), Music Selector service (stub), Voice WebSocket router (full pipeline), REST world generation endpoints, and comprehensive test suite.
  - `backend/main.py` — FastAPI app with CORS, health endpoint, router mounts
  - `backend/config.py` — Environment variable loading from `.env`
  - `backend/requirements.txt` — Python dependencies (fastapi, uvicorn, websockets, gradium, google-genai, httpx, python-dotenv, pytest, pytest-asyncio)
  - `backend/.env.example` — API key template
  - `backend/routers/__init__.py` — Router package init
  - `backend/routers/voice.py` — WebSocket voice pipeline (`/ws/voice`): audio → STT → transcript → VAD turn detection → Gemini → TTS → audio back. Handles function call side-effects (world gen, music, facts, location suggestions)
  - `backend/routers/worlds.py` — REST endpoints: `POST /api/worlds/generate`, `GET /api/worlds/status/{operation_id}`
  - `backend/services/__init__.py` — Services package init
  - `backend/services/gradium_service.py` — Raw WebSocket client for Gradium STT (PCM 24kHz → transcript + VAD) and TTS (text → base64-encoded PCM 48kHz audio JSON)
  - `backend/services/gemini_guide.py` — Gemini 2.5 Flash conversation engine with system prompt, 4 function tools (`trigger_world_generation`, `select_music`, `generate_fact`, `suggest_location`), streaming responses, multi-turn history
  - `backend/services/world_labs.py` — World Labs Marble API client: `generate_world()`, `poll_status()`, `get_world_assets()`, SPZ URL extraction
  - `backend/services/music_selector.py` — Stub music track selector with scoring-based matching
  - `backend/tests/__init__.py` — Tests package init
  - `backend/tests/conftest.py` — Shared pytest fixtures: `requires_gradium`, `requires_gemini`, `requires_world_labs` skip markers, sys.path setup
  - `backend/tests/test_gradium_stt.py` — 3 STT integration tests
  - `backend/tests/test_gradium_tts.py` — 4 TTS integration tests
  - `backend/tests/test_gemini_guide.py` — 6 Gemini tests (4 integration, 2 unit)
  - `backend/tests/test_world_labs.py` — 8 World Labs unit tests (all mocked)
  - `backend/tests/test_voice_pipeline.py` — 6 smoke/unit tests (imports, music selector, FastAPI app, health endpoint)

### Fixed
- **Gradium TTS — Audio was not being received** — Root cause: TTS sends audio as base64-encoded JSON (`{"type": "audio", "audio": "<base64>"}`) not raw binary WebSocket frames. Fixed `iter_audio()` and `receive_audio()` to parse JSON and decode base64. Also fixed flush message from `{"type": "flush"}` to `{"type": "end_of_stream"}` per docs. Added waiting for `{"type": "ready"}` confirmation after setup.
  - `backend/services/gradium_service.py`
- **Gemini — Function calling combined with Google Search caused 400 error** — Root cause: Gemini 2.5 Flash does not support combining `function_declarations` tools with `google_search` tools in the same request (returns `"Tool use with function calling is unsupported by the model"`). Removed Google Search grounding tool; function calling tools work correctly alone.
  - `backend/services/gemini_guide.py`
- **VAD parsing format mismatch** — Root cause: Actual Gradium VAD format is `[{horizon_s, inactivity_prob}, ...]` (list of objects), not `[timestamp, duration, {inactivity_prob}]` as documented in TECHNICAL.md. Updated voice router to iterate over VAD entries correctly.
  - `backend/routers/voice.py`

### Test Results — 27/27 Passing

| # | Test | File | Type | Status | Metric |
|---|------|------|------|--------|--------|
| 1 | `test_stt_connection` | `test_gradium_stt.py` | Integration | PASS | Connection: **0.170s** |
| 2 | `test_stt_receives_vad_on_silence` | `test_gradium_stt.py` | Integration | PASS | VAD entries: 4 horizons (0.5s–3.0s) |
| 3 | `test_stt_transcript_on_audio` | `test_gradium_stt.py` | Integration | PASS | 14 messages (ready + VAD steps) |
| 4 | `test_tts_connection` | `test_gradium_tts.py` | Integration | PASS | Connection: **0.229s** |
| 5 | `test_tts_synthesize_text` | `test_gradium_tts.py` | Integration | PASS | 47 chunks, 360,960 bytes, **3.76s** audio, TTFC: **0.201s** |
| 6 | `test_tts_latency` | `test_gradium_tts.py` | Performance | PASS | TTFC: **0.201s** (target: <0.300s) |
| 7 | `test_tts_chunk_size` | `test_gradium_tts.py` | Integration | PASS | All chunks: **7,680 bytes** (3,840 samples, 80ms @ 48kHz) |
| 8 | `test_gemini_text_response` | `test_gemini_guide.py` | Integration | PASS | TTFC: **0.637s**, 91 chars, streaming text |
| 9 | `test_gemini_function_calling` | `test_gemini_guide.py` | Integration | PASS | 1 function call: `trigger_world_generation`, 4 text chunks |
| 10 | `test_gemini_conversation_history` | `test_gemini_guide.py` | Integration | PASS | 2-turn conversation, 4 history messages, context preserved |
| 11 | `test_gemini_response_latency` | `test_gemini_guide.py` | Performance | PASS | TTFT: **0.901s** (target: <1.0s) |
| 12 | `test_gemini_context_update` | `test_gemini_guide.py` | Unit | PASS | Context merges correctly |
| 13 | `test_gemini_reset` | `test_gemini_guide.py` | Unit | PASS | History clears |
| 14 | `test_app_imports` | `test_voice_pipeline.py` | Smoke | PASS | All modules import |
| 15 | `test_music_selector_exact_match` | `test_voice_pipeline.py` | Unit | PASS | "Glory of the Forum" matched |
| 16 | `test_music_selector_partial_match` | `test_voice_pipeline.py` | Unit | PASS | "Stone Corridors" partial match |
| 17 | `test_music_selector_no_match` | `test_voice_pipeline.py` | Unit | PASS | Fallback returned |
| 18 | `test_fastapi_app_creates` | `test_voice_pipeline.py` | Smoke | PASS | 8 routes registered |
| 19 | `test_health_endpoint` | `test_voice_pipeline.py` | Smoke | PASS | `GET /health` → 200 OK |
| 20 | `test_get_splat_url_500k` | `test_world_labs.py` | Unit | PASS | 500k SPZ URL extracted |
| 21 | `test_get_splat_url_100k` | `test_world_labs.py` | Unit | PASS | 100k SPZ URL extracted |
| 22 | `test_get_splat_url_full` | `test_world_labs.py` | Unit | PASS | Full SPZ URL extracted |
| 23 | `test_get_splat_url_fallback` | `test_world_labs.py` | Unit | PASS | Falls back to last URL |
| 24 | `test_get_splat_url_empty_assets` | `test_world_labs.py` | Unit | PASS | Returns None |
| 25 | `test_get_splat_url_missing_assets` | `test_world_labs.py` | Unit | PASS | Returns None |
| 26 | `test_service_headers` | `test_world_labs.py` | Unit | PASS | `WLT-Api-Key` header set |
| 27 | `test_world_data_structure` | `test_world_labs.py` | Unit | PASS | Schema matches TECHNICAL.md |

### Performance Summary

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Gradium STT connection | < 1s | **0.170s** | PASS |
| Gradium TTS connection | < 1s | **0.229s** | PASS |
| Gradium TTS time-to-first-chunk | < 300ms | **0.201s** | PASS |
| Gradium TTS chunk size | 7,680 bytes (80ms) | **7,680 bytes** | PASS |
| Gemini time-to-first-text | < 1s | **0.637s** | PASS |
| Gemini time-to-first-text (latency test) | < 1s | **0.901s** | PASS |

### API Doc Discrepancies Found
- **Gradium TTS audio format**: Docs confirmed audio arrives as base64-encoded JSON frames (`{"type": "audio", "audio": "..."}`) — not raw binary WebSocket frames. TECHNICAL.md previously implied binary.
- **Gradium TTS flush message**: Correct message is `{"type": "end_of_stream"}`, not `{"type": "flush"}`.
- **Gradium TTS ready message**: Server sends `{"type": "ready", "request_id": "..."}` after setup — must wait before sending text.
- **Gradium STT VAD format**: Actual format is `[{horizon_s: float, inactivity_prob: float}, ...]` — a list of objects per horizon. TECHNICAL.md documented it as `[timestamp, duration, {inactivity_prob}]`.
- **Gradium STT ready message**: Server sends `{"type": "ready", ...}` after setup (undocumented in TECHNICAL.md).
- **Gemini tool compatibility**: `google_search` and `function_declarations` cannot be combined in the same request for `gemini-2.5-flash`. Returns 400 error.
- **Gemini free tier rate limit**: 5 requests/min for `gemini-2.5-flash`. Integration tests must be run with delays between Gemini tests.

### Notes
- All 27 tests pass. Gemini integration tests hit free-tier rate limits (5 req/min) when run consecutively — run individually with ~20s delays or upgrade to paid tier.
- World Labs tests are fully mocked to avoid consuming API credits.
- `backend/venv/` was created with Python 3.12.4 and all dependencies installed successfully.
- FastAPI app serves 8 routes: `/health`, `/ws/voice`, `/api/worlds/generate`, `/api/worlds/status/{operation_id}`, plus OpenAPI docs.

---

## [Session 2] - 2026-02-07

### Changed
- **TECHNICAL.md — Globe integration specification** — Replaced generic Globe.gl reference with detailed react-globe.gl + CartoDB Dark Matter tile engine specification. Added new Section 3 covering: tile engine setup, click-to-coordinate with Nominatim reverse geocoding, marker rendering (pointsData + ringsData), camera fly-to animation, backend-driven location suggestion flow, styling, WebGL context cleanup, and TypeScript typing. Also added `suggest_location` to Gemini function tools, `suggested_location` to WebSocket protocol, `types/` directory to file structure, and updated dependencies from `globe.gl` to `react-globe.gl`.
  - `docs/TECHNICAL.md`
- **PRD.md — Globe & Time Selection phase updated** — Updated Phase 2 user flow to specify react-globe.gl with CartoDB tiles, real map imagery at zoom, glowing markers with pulsing rings, reverse geocoding for location names, AI-driven location suggestions, and glassmorphism info card. Updated MVP feature table with detailed globe description.
  - `docs/PRD.md`
- **ROADMAP.md — Globe tasks expanded** — Replaced generic Globe.gl task with 7 specific react-globe.gl implementation tasks in Phase 1 (tile engine, click handler, markers, fly-to, auto-rotate, type declaration, info card). Added `suggested_location` WebSocket handling and WebGL cleanup tasks to Phase 2 Person A. Added `suggest_location` Gemini function tool to Phase 1 Person B and handler to Phase 2 Person B. Updated MVP cut list.
  - `docs/ROADMAP.md`

### Notes
- Chose react-globe.gl over Mapbox GL JS, CesiumJS, and deck.gl based on: same Three.js stack as SparkJS, no API key needed, all required features (click-to-coordinate, markers, fly-to, tile imagery) built-in, lightweight for hackathon scope.
- CartoDB `dark_nolabels` tiles chosen over `dark_all` because flat text labels distort on a 3D sphere surface.
- Nominatim chosen for reverse geocoding: free, no API key, 1 req/s rate limit is fine for interactive click use.

---

## [Session 1] - 2026-02-07

### Changed
- **CLAUDE.md — Added mandatory changelog update rule** — Ensures every code change is tracked with justification and affected file paths, using the template format from CHANGELOG.md
  - `CLAUDE.md`

---

<!-- Template for new entries:

## [Session X] - YYYY-MM-DD HH:MM

### Added
- **Feature/item name** — Justification for why this was added
  - `path/to/file1.ts`
  - `path/to/file2.py`

### Changed
- **What changed** — Why this change was made
  - `path/to/modified/file.ts`

### Fixed
- **Bug description** — Root cause and how it was resolved
  - `path/to/fixed/file.py`

### Removed
- **What was removed** — Why it was removed
  - `path/to/deleted/file.ts`

### Notes
- Observations, decisions, blockers, or anything worth remembering

-->
