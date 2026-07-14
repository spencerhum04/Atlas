"""Voice WebSocket router — the core real-time pipeline.

Full flow (per TECHNICAL.md Section 4):
  Frontend audio chunks → Gradium STT → transcript text
  → Gemini (streaming) → response text → Gradium TTS → audio chunks
  → Frontend playback

Supports barge-in: if the user speaks while the guide is responding,
the current response is cancelled, playback is interrupted on the frontend,
and the new user input is processed immediately.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import re
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from config import GRADIUM_API_KEY, GEMINI_API_KEY, WORLD_LABS_API_KEY
from services.gradium_service import GradiumService
from google.genai import types
from services.gemini_guide import GeminiGuide
from services.world_labs import WorldLabsService
from services.music_selector import select_track
from services.deezer_service import DeezerService

logger = logging.getLogger(__name__)
router = APIRouter()

# VAD inactivity threshold — only trigger on sustained silence, not brief word pauses.
# We check horizons >= 2.0s only. The 1.0s horizon fires on brief inter-word gaps
# (e.g. 0.85 after just 500ms of pause between "the" and "world"), but the 2.0s
# horizon stays low (0.22) during those same gaps. This prevents premature turns.
VAD_INACTIVITY_THRESHOLD = 0.7
VAD_MIN_HORIZON_S = 2.0
# After VAD says "user stopped", wait this long for STT pipeline to flush
# remaining words before firing the turn. Prevents split sentences.
TURN_DEBOUNCE_S = 0.5
# After a barge-in interrupt, the user is typically still mid-sentence.
# STT fragments arrive in bursts (mic picks up tail of TTS + user speech).
# Use a longer debounce to let the full sentence arrive before firing.
TURN_DEBOUNCE_AFTER_INTERRUPT_S = 1.5
# How long after an interrupt the extended debounce stays active.
INTERRUPT_DEBOUNCE_WINDOW_S = 3.0


def _ts() -> str:
    """Compact timestamp for logging (seconds.millis since epoch)."""
    return f"{time.time():.3f}"


def _sanitize_for_tts(text: str) -> str:
    """Clean Gemini text for natural TTS readability.

    Strips markdown formatting, collapses whitespace, and replaces
    characters that TTS engines read awkwardly or skip entirely.
    """
    text = text.replace("\n", " ")
    text = text.replace("...", ", ")
    text = re.sub(r"\*+", "", text)      # bold/italic asterisks
    text = re.sub(r"#+\s*", "", text)    # markdown headers
    text = re.sub(r"`+", "", text)       # code backticks
    text = re.sub(r"\s+", " ", text)     # collapse whitespace
    return text


async def _send_json(ws: WebSocket, msg: dict, closed: asyncio.Event) -> None:
    """Send a JSON message to the frontend WebSocket, unless closed."""
    if closed.is_set():
        print(f"[{_ts()}][WS→FE] BLOCKED (ws closed): {msg.get('type')}")
        return
    try:
        await ws.send_text(json.dumps(msg))
        # Log outbound messages (truncate audio data)
        log_msg = dict(msg)
        if log_msg.get("data") and len(str(log_msg["data"])) > 60:
            log_msg["data"] = f"<{len(str(msg['data']))} chars b64>"
        print(f"[{_ts()}][WS→FE] {json.dumps(log_msg)}")
    except Exception as e:
        print(f"[{_ts()}][WS→FE] SEND ERROR: {e}")
        closed.set()


async def _handle_function_call(
    fc: dict,
    ws: WebSocket,
    gemini: GeminiGuide,
    world_labs: WorldLabsService,
    deezer: DeezerService,
    closed: asyncio.Event,
) -> None:
    """Execute a Gemini function call and send results to frontend."""
    name = fc["name"]
    args = fc["args"]
    print(f"[{_ts()}][FUNC] Executing: {name}({json.dumps(args)})")

    if name == "trigger_world_generation":
        await _send_json(ws, {"type": "world_status", "status": "generating"}, closed)
        try:
            operation_id = await world_labs.generate_world(
                scene_description=args["scene_description"],
                display_name=f"{args['location']} — {args['time_period']}",
            )
            asyncio.create_task(
                _poll_world_and_notify(operation_id, ws, world_labs, closed)
            )
            gemini.add_function_result(name, {"status": "generation_started", "operation_id": operation_id})
        except Exception as e:
            logger.error("World generation failed: %s", e)
            await _send_json(ws, {"type": "world_status", "status": "error"}, closed)
            gemini.add_function_result(name, {"status": "error", "error": str(e)})

    elif name == "select_music":
        # Try Deezer first (no auth needed), fall back to downloaded tracks.
        # Find TWO songs: first for loading phase, second for exploring phase.
        song_suggestions = args.get("song_suggestions", [])
        print(f"[{_ts()}][FUNC] select_music: era={args.get('era')} region={args.get('region')} mood={args.get('mood')} songs={song_suggestions}")
        loading_track = None
        explore_track = None
        if song_suggestions:
            try:
                for song in song_suggestions:
                    results = await deezer.search_tracks(song, limit=3)
                    if results:
                        if loading_track is None:
                            loading_track = results[0]
                            print(f"[{_ts()}][FUNC] Deezer loading track: '{loading_track['title']}' for query '{song}'")
                        elif explore_track is None:
                            explore_track = results[0]
                            print(f"[{_ts()}][FUNC] Deezer explore track: '{explore_track['title']}' for query '{song}'")
                            break  # Found both
                    else:
                        print(f"[{_ts()}][FUNC] Deezer: 0 results for '{song}', trying next...")

                # If we found loading but not explore, try broader fallback searches
                if loading_track and not explore_track:
                    era = args.get("era", "")
                    region = args.get("region", "")
                    fallback_queries = [
                        f"{region} traditional music",
                        f"{region} {era} music",
                        f"{region} instrumental",
                    ]
                    for query in fallback_queries:
                        results = await deezer.search_tracks(query, limit=5)
                        if results:
                            # Pick a different track than loading if possible
                            for r in results:
                                if r["preview_url"] != loading_track["preview_url"]:
                                    explore_track = r
                                    break
                            if not explore_track:
                                explore_track = results[0]
                            if explore_track:
                                print(f"[{_ts()}][FUNC] Deezer explore fallback: '{explore_track['title']}' for query '{query}'")
                                break

                if not loading_track:
                    print(f"[{_ts()}][FUNC] Deezer: 0 results for all {len(song_suggestions)} song suggestions")
            except Exception as e:
                print(f"[{_ts()}][FUNC] Deezer search failed: {e} — falling back to local")

        if loading_track:
            music_msg = {
                "type": "music",
                "source": "deezer",
                "trackUrl": loading_track["preview_url"],
                "trackName": loading_track["title"],
                "artist": loading_track["artist"],
            }
            if explore_track:
                music_msg["exploreTrackUrl"] = explore_track["preview_url"]
                music_msg["exploreTrackName"] = explore_track["title"]
                music_msg["exploreArtist"] = explore_track["artist"]
                print(f"[{_ts()}][FUNC] Music queue: loading=\"{loading_track['title']}\", explore=\"{explore_track['title']}\"")
            else:
                # Last resort: reuse loading track for exploring phase too
                music_msg["exploreTrackUrl"] = loading_track["preview_url"]
                music_msg["exploreTrackName"] = loading_track["title"]
                music_msg["exploreArtist"] = loading_track["artist"]
                print(f"[{_ts()}][FUNC] Music queue: loading=\"{loading_track['title']}\" (reusing for explore — no second track)")
            await _send_json(ws, music_msg, closed)
            gemini.add_function_result(name, {"status": "playing_deezer", "track": loading_track["title"]})
        else:
            # Fallback to downloaded tracks
            track = select_track(era=args["era"], region=args["region"], mood=args["mood"])
            if track:
                print(f"[{_ts()}][FUNC] Playing local fallback: \"{track['title']}\"")
                await _send_json(ws, {"type": "music", "source": "local", "trackUrl": track["file"]}, closed)
                gemini.add_function_result(name, {"status": "playing_local", "track": track["title"]})
            else:
                print(f"[{_ts()}][FUNC] No music found (Deezer + local both empty)")
                gemini.add_function_result(name, {"status": "no_track_found"})

    elif name == "generate_fact":
        await _send_json(ws, {
            "type": "fact",
            "text": args["fact_text"],
            "category": args["category"],
        }, closed)
        gemini.add_function_result(name, {"status": "displayed"})

    elif name == "suggest_location":
        loc_msg: dict = {
            "type": "suggested_location",
            "lat": args["lat"],
            "lng": args["lng"],
            "name": args["name"],
        }
        if "year" in args:
            loc_msg["year"] = args["year"]
        await _send_json(ws, loc_msg, closed)
        gemini.add_function_result(name, {"status": "location_suggested"})

    elif name == "summarize_session":
        print(f"[{_ts()}][FUNC] Session summary generated")
        await _send_json(ws, {
            "type": "session_summary",
            "userProfile": args["user_profile"],
            "worldDescription": args["world_description"],
        }, closed)
        gemini.add_function_result(name, {"status": "session_saved"})

    elif name == "generate_loading_messages":
        messages = args.get("messages", [])
        print(f"[{_ts()}][FUNC] Loading messages generated: {len(messages)} messages")
        await _send_json(ws, {
            "type": "loading_messages",
            "messages": messages,
        }, closed)
        gemini.add_function_result(name, {"status": "messages_sent", "count": len(messages)})

    else:
        print(f"[{_ts()}][FUNC] Unknown function call: {name}")


async def _poll_world_and_notify(
    operation_id: str, ws: WebSocket, world_labs: WorldLabsService, closed: asyncio.Event,
) -> None:
    """Background task: poll world generation status and notify frontend."""
    try:
        operation_response = await world_labs.poll_status(operation_id)
        world_id = WorldLabsService.extract_world_id(operation_response) or ""
        world_data = await world_labs.get_world_assets(world_id) if world_id else operation_response
        renderable_assets = WorldLabsService.extract_renderable_assets(world_data)
        await _send_json(ws, {
            "type": "world_status",
            "status": "ready",
            "worldId": world_id,
            "splatUrl": renderable_assets.get("default_spz_url"),
            "worldAssets": renderable_assets,
        }, closed)
    except Exception as e:
        logger.error("World polling failed: %s", e)
        await _send_json(ws, {"type": "world_status", "status": "error"}, closed)


async def _process_gemini_response(
    user_text: str,
    ws: WebSocket,
    gemini: GeminiGuide,
    gradium: GradiumService,
    world_labs: WorldLabsService,
    closed: asyncio.Event,
    deezer: DeezerService | None = None,
    frame_event: asyncio.Event | None = None,
    frame_holder: dict | None = None,
) -> None:
    """Send user text to Gemini, stream response text to TTS and frontend.

    Handles asyncio.CancelledError for barge-in support — when the user
    starts speaking mid-response, this task is cancelled and TTS is closed.

    If TTS creation fails (e.g. concurrency limit), falls back to text-only mode.
    """
    tts_stream = None
    tts_recv_task = None
    response_id = f"resp-{time.time():.0f}"

    print(f"[{_ts()}][GEMINI] ===== RESPONSE {response_id} START =====")
    print(f"[{_ts()}][GEMINI] User text: \"{user_text}\"")
    print(f"[{_ts()}][GEMINI] History length: {len(gemini.conversation_history)} entries")

    # Notify frontend which response is now active — frontend uses this to
    # drop stale audio from previous (cancelled) responses still in-flight.
    await _send_json(ws, {"type": "response_start", "responseId": response_id}, closed)

    is_transition = gemini.context.get("phase") == "transition"

    try:
        # Skip TTS entirely during transition — no voice response needed,
        # just tool calls (summarize_session, loading_messages, select_music).
        if is_transition:
            print(f"[{_ts()}][TTS] Skipping TTS for transition phase (tools only)")
        else:
            # Try to create TTS stream with retry for concurrency limits.
            # Gradium has a 2-session limit; closed sessions take a moment to free.
            for _tts_attempt in range(3):
                try:
                    tts_stream = await gradium.create_tts_stream()
                    print(f"[{_ts()}][TTS] Stream created OK for {response_id}")
                    break
                except ConnectionError as e:
                    if "Concurrencylimit" in str(e) and _tts_attempt < 2:
                        print(f"[{_ts()}][TTS] Concurrency limit, retry {_tts_attempt + 1}/3 in 3s...")
                        await asyncio.sleep(3)
                    else:
                        print(f"[{_ts()}][TTS] UNAVAILABLE ({e}), text-only fallback")
                        break
                except Exception as e:
                    print(f"[{_ts()}][TTS] UNAVAILABLE ({e}), text-only fallback")
                    break

        # If TTS is available, start forwarding audio to frontend
        if tts_stream:
            tts_chunk_count = 0

            async def forward_tts_audio():
                nonlocal tts_chunk_count
                async for msg_type, payload in tts_stream.iter_audio():
                    if msg_type == "audio":
                        tts_chunk_count += 1
                        encoded = base64.b64encode(payload).decode("ascii")
                        if tts_chunk_count <= 3 or tts_chunk_count % 20 == 0:
                            print(f"[{_ts()}][TTS→FE] Audio chunk #{tts_chunk_count}: {len(payload)} bytes")
                        await _send_json(ws, {"type": "audio", "data": encoded, "responseId": response_id}, closed)
                    elif msg_type == "timestamp":
                        await _send_json(ws, {
                            "type": "word_timestamp",
                            "text": payload["text"],
                            "startS": payload["start_s"],
                            "stopS": payload["stop_s"],
                            "responseId": response_id,
                        }, closed)
                print(f"[{_ts()}][TTS] Audio stream ended. Total chunks: {tts_chunk_count}")

            tts_recv_task = asyncio.create_task(forward_tts_audio())

        # In exploring phase, get a canvas frame for Gemini visual context.
        # Frontend proactively sends frames on speech (transcript events), so
        # frame_holder usually already has a recent frame. Also send request_frame
        # as a backup and wait briefly for a fresh capture.
        frame_image_part = None
        if gemini.context.get("phase") == "exploring" and frame_holder is not None:
            # Request a fresh frame (non-blocking backup)
            if frame_event:
                frame_event.clear()
                await _send_json(ws, {"type": "request_frame"}, closed)
                try:
                    await asyncio.wait_for(frame_event.wait(), timeout=1.5)
                except asyncio.TimeoutError:
                    print(f"[{_ts()}][FRAME] Request timed out — using stored frame if available")

            # Use whatever frame we have (proactive or from request)
            frame_b64 = frame_holder.get("image")
            if frame_b64:
                try:
                    frame_image_part = types.Part(
                        inline_data=types.Blob(
                            mime_type="image/jpeg",
                            data=base64.b64decode(frame_b64),
                        )
                    )
                    print(f"[{_ts()}][FRAME] Using canvas frame ({len(frame_b64)} chars b64)")
                except Exception as e:
                    print(f"[{_ts()}][FRAME] Failed to decode frame: {e}")
            else:
                print(f"[{_ts()}][FRAME] No frame available")

        # Stream Gemini response — text always goes to frontend, TTS if available.
        # Loop handles function calling: after executing function calls and adding
        # results to history, call Gemini again to get the follow-up voice response.
        MAX_FUNCTION_ROUNDS = 3
        gemini_chunk_count = 0
        full_response_text = ""
        input_text: str | None = user_text

        for round_num in range(MAX_FUNCTION_ROUNDS + 1):
            function_calls_this_round = []

            async for chunk in gemini.generate_response(input_text, image_part=frame_image_part):
                if chunk["type"] == "text":
                    text_piece = chunk["text"]
                    full_response_text += text_piece
                    gemini_chunk_count += 1
                    # During transition, discard text — no voice response needed
                    if is_transition:
                        continue
                    print(f"[{_ts()}][GEMINI] Chunk #{gemini_chunk_count}: \"{text_piece}\"")
                    await _send_json(ws, {"type": "guide_text", "text": text_piece, "responseId": response_id}, closed)
                    if tts_stream:
                        tts_text = _sanitize_for_tts(text_piece)
                        if tts_text.strip():
                            await tts_stream.send_text(tts_text)

                elif chunk["type"] == "function_call":
                    print(f"[{_ts()}][GEMINI] Function call: {chunk['name']}")
                    function_calls_this_round.append(chunk)
                    await _handle_function_call(chunk, ws, gemini, world_labs, deezer, closed)

            if not function_calls_this_round:
                break  # Pure text response — done

            # In transition phase, one round of tool calls is all we need.
            # Don't loop back — Gemini would generate a huge narration in round 2.
            if gemini.context.get("phase") == "transition":
                print(f"[{_ts()}][GEMINI] Transition round complete — skipping follow-up")
                break

            # Function calls were made — call Gemini again for follow-up voice response
            print(f"[{_ts()}][GEMINI] Round {round_num + 1}: {len(function_calls_this_round)} function call(s), continuing for follow-up...")
            input_text = None  # No new user message — continue from function result
            frame_image_part = None  # Only attach frame on first round

        # Safety net: if Gemini only generated function calls with no spoken
        # text, force one more call explicitly requesting speech. This prevents
        # silent responses in exploring phase where Gemini sometimes prioritises
        # tool calls (generate_fact) over spoken output.
        if not full_response_text.strip() and not is_transition and tts_stream:
            print(f"[{_ts()}][GEMINI] WARNING: No spoken text generated — forcing voice follow-up")
            gemini.conversation_history.append(
                types.Content(role="user", parts=[types.Part(text=(
                    "[System: You just called tools but produced no spoken text. "
                    "The user cannot hear you. Respond NOW with 1-2 spoken sentences "
                    "about what you just shared. Do NOT call any tools.]"
                ))])
            )
            async for chunk in gemini.generate_response(None):
                if chunk["type"] == "text":
                    text_piece = chunk["text"]
                    full_response_text += text_piece
                    gemini_chunk_count += 1
                    print(f"[{_ts()}][GEMINI] Forced chunk #{gemini_chunk_count}: \"{text_piece}\"")
                    await _send_json(ws, {"type": "guide_text", "text": text_piece, "responseId": response_id}, closed)
                    tts_text = _sanitize_for_tts(text_piece)
                    if tts_text.strip():
                        await tts_stream.send_text(tts_text)

        print(f"[{_ts()}][GEMINI] Response complete. {gemini_chunk_count} text chunks, {len(full_response_text)} chars")

        # Signal TTS that we're done sending text
        if tts_stream:
            print(f"[{_ts()}][TTS] Sending flush (end_of_stream)")
            await tts_stream.send_flush()

        # Wait for all TTS audio to be forwarded
        if tts_recv_task:
            print(f"[{_ts()}][TTS] Waiting for audio forwarding to complete...")
            await tts_recv_task
            print(f"[{_ts()}][TTS] Audio forwarding done")

        # Signal frontend that the transition flow is complete (all tool calls
        # executed, all TTS audio forwarded). Frontend uses this to disconnect
        # voice and switch to loading phase.
        if gemini.context.get("phase") == "transition":
            print(f"[{_ts()}][VOICE] Transition complete — signaling frontend")
            await _send_json(ws, {"type": "transition_complete"}, closed)

    except asyncio.CancelledError:
        print(f"[{_ts()}][GEMINI] ===== RESPONSE {response_id} CANCELLED (barge-in) =====")
        if tts_recv_task and not tts_recv_task.done():
            tts_recv_task.cancel()
            try:
                await tts_recv_task
            except (asyncio.CancelledError, Exception):
                pass
    except Exception as e:
        print(f"[{_ts()}][GEMINI] ===== RESPONSE {response_id} ERROR: {e} =====")
    finally:
        if tts_stream:
            try:
                # Per Gradium best practices: send end_of_stream before closing
                # so the server can clean up the session faster. We don't await
                # remaining audio — just signal and close immediately.
                await tts_stream.send_flush()
            except Exception:
                pass
            try:
                await tts_stream.close()
                print(f"[{_ts()}][TTS] Stream closed for {response_id}")
            except Exception:
                pass
        print(f"[{_ts()}][GEMINI] ===== RESPONSE {response_id} END =====")


@router.websocket("/ws/voice")
async def voice_ws(websocket: WebSocket):
    """Main voice pipeline WebSocket endpoint."""
    await websocket.accept()
    print(f"[{_ts()}][VOICE] ========== WebSocket CONNECTED ==========")

    gradium = GradiumService(api_key=GRADIUM_API_KEY)
    gemini = GeminiGuide(api_key=GEMINI_API_KEY)
    world_labs = WorldLabsService(api_key=WORLD_LABS_API_KEY)

    deezer = DeezerService()

    stt_stream = None
    transcript_buffer = ""
    current_response: asyncio.Task | None = None
    ws_closed = asyncio.Event()  # Prevents sending on a closed WebSocket
    turn_count = 0
    last_interrupt_at = 0.0  # Shared: set by interrupt handler, read by STT task

    # Frame capture for Gemini visual context (exploring phase)
    frame_event = asyncio.Event()
    frame_holder: dict = {}  # {"image": "<base64_jpeg>"}

    try:
        print(f"[{_ts()}][VOICE] Creating STT stream...")
        stt_stream = await gradium.create_stt_stream()
        print(f"[{_ts()}][VOICE] STT stream created OK")

        # Task: receive STT messages (transcripts + VAD)
        async def receive_stt():
            nonlocal transcript_buffer, current_response, turn_count, last_interrupt_at
            msg_count = 0
            turn_ready = False
            last_stt_word_at = 0.0
            turn_fired_at = 0.0
            while True:
                try:
                    msg = await stt_stream.receive()
                    msg_count += 1
                    msg_type = msg.get("type", "unknown")
                except Exception as e:
                    print(f"[{_ts()}][STT] Receive error after {msg_count} msgs: {e}")
                    break

                if msg_type == "text":
                    text = msg["text"]
                    transcript_buffer += " " + text
                    # Ignore late STT words that arrive after a turn already fired —
                    # they're trailing transcription, not new speech. Updating
                    # last_stt_word_at would reset the debounce and risk double-firing.
                    since_last_fire = time.time() - turn_fired_at
                    if since_last_fire > 1.5:
                        last_stt_word_at = time.time()
                    print(f"[{_ts()}][STT] TRANSCRIPT: \"{text}\" | Buffer: \"{transcript_buffer.strip()}\"" + (f" (late, ignored for debounce)" if since_last_fire <= 1.5 else ""))
                    await _send_json(websocket, {
                        "type": "transcript",
                        "text": text,
                        "partial": False,
                    }, ws_closed)
                    # NOTE: No STT-based barge-in here. Barge-in is handled
                    # exclusively by frontend mic activity detection (interrupt msg).
                    # STT words often arrive after VAD fires, causing false barge-in.

                elif msg_type == "step":
                    # VAD format: list of {horizon_s, inactivity_prob} objects.
                    # Only check horizons >= VAD_MIN_HORIZON_S to avoid triggering
                    # on brief mid-sentence pauses (e.g. 0.5s between words).
                    vad = msg.get("vad", [])
                    max_inactivity = 0.0
                    qualifying_horizons = []
                    for entry in vad:
                        if isinstance(entry, dict):
                            h = entry.get("horizon_s", 0)
                            p = entry.get("inactivity_prob", 0)
                            if h >= VAD_MIN_HORIZON_S:
                                qualifying_horizons.append(f"{h}s:{p:.2f}")
                                max_inactivity = max(max_inactivity, p)

                    # Log VAD: always when buffer has text, every 50th step otherwise
                    has_text = bool(transcript_buffer.strip())
                    if has_text or (msg_count % 50 == 0):
                        print(
                            f"[{_ts()}][VAD] step#{msg_count} | "
                            f"max_inactivity={max_inactivity:.2f} (thresh={VAD_INACTIVITY_THRESHOLD}) | "
                            f"horizons=[{', '.join(qualifying_horizons)}] | "
                            f"buffer={'\"' + transcript_buffer.strip()[:50] + '\"' if has_text else '<empty>'} | "
                            f"{'>>> WOULD FIRE' if max_inactivity > VAD_INACTIVITY_THRESHOLD and has_text else 'no trigger'}"
                        )

                    if max_inactivity > VAD_INACTIVITY_THRESHOLD and transcript_buffer.strip():
                        # Don't re-arm turn_ready if we just fired — prevents double-firing
                        # when late STT words arrive after the turn already launched.
                        since_last_fire = time.time() - turn_fired_at
                        if not turn_ready and since_last_fire > 2.0:
                            print(f"[{_ts()}][VAD] Turn READY — waiting {TURN_DEBOUNCE_S}s for STT to settle")
                            turn_ready = True

                elif msg_type == "ready":
                    print(f"[{_ts()}][STT] Ready message received")

                else:
                    print(f"[{_ts()}][STT] Unknown msg type={msg_type}: {str(msg)[:150]}")

                # --- Debounced turn firing ---
                # Fire turn only after VAD indicates silence AND STT has settled
                # (no new words for TURN_DEBOUNCE_S). This prevents splitting
                # sentences when STT delivers trailing words after VAD fires.
                # After a barge-in interrupt, use a longer debounce — the user
                # is likely still mid-sentence and STT fragments arrive in bursts.
                since_interrupt = time.time() - last_interrupt_at
                debounce = (
                    TURN_DEBOUNCE_AFTER_INTERRUPT_S
                    if since_interrupt < INTERRUPT_DEBOUNCE_WINDOW_S
                    else TURN_DEBOUNCE_S
                )
                if (turn_ready
                        and transcript_buffer.strip()
                        and last_stt_word_at > 0
                        and (time.time() - last_stt_word_at) > debounce):
                    turn_count += 1
                    user_text = transcript_buffer.strip()
                    transcript_buffer = ""
                    turn_ready = False
                    last_stt_word_at = 0.0
                    turn_fired_at = time.time()
                    debounce_type = "post-interrupt" if since_interrupt < INTERRUPT_DEBOUNCE_WINDOW_S else "normal"
                    print(f"[{_ts()}][VOICE] ===== TURN #{turn_count} FIRED ({debounce_type} debounce={debounce}s) =====")
                    print(f"[{_ts()}][VOICE] User said: \"{user_text}\"")

                    # Cancel any in-progress response and wait for TTS cleanup
                    if current_response and not current_response.done():
                        print(f"[{_ts()}][VOICE] Cancelling previous response for new turn")
                        current_response.cancel()
                        try:
                            await current_response
                        except (asyncio.CancelledError, Exception):
                            pass
                        await _send_json(websocket, {"type": "interrupt"}, ws_closed)

                    # Launch new response as background task (non-blocking)
                    print(f"[{_ts()}][VOICE] Launching Gemini response task for turn #{turn_count}")
                    current_response = asyncio.create_task(
                        _process_gemini_response(
                            user_text, websocket, gemini, gradium, world_labs, ws_closed, deezer,
                            frame_event=frame_event, frame_holder=frame_holder,
                        )
                    )

        stt_task = asyncio.create_task(receive_stt())
        print(f"[{_ts()}][VOICE] STT receive task started, entering main loop")

        audio_msg_count = 0
        interrupt_count = 0
        # Main loop: receive messages from frontend
        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)
            msg_type = msg.get("type")

            if msg_type == "audio":
                # Forward audio to Gradium STT
                pcm_bytes = base64.b64decode(msg["data"])
                audio_msg_count += 1
                if audio_msg_count <= 5 or audio_msg_count % 100 == 0:
                    print(f"[{_ts()}][FE→STT] Audio chunk #{audio_msg_count}: {len(pcm_bytes)} bytes")
                await stt_stream.send_audio(pcm_bytes)

            elif msg_type == "context":
                # Update Gemini guide context
                location = msg.get("location", {})
                time_period = msg.get("timePeriod", {})
                print(f"[{_ts()}][FE→BE] Context update: location={location}, timePeriod={time_period}")
                gemini.update_context(
                    location_name=location.get("name", ""),
                    lat=location.get("lat", ""),
                    lng=location.get("lng", ""),
                    time_period=time_period.get("label", ""),
                    year=time_period.get("year", ""),
                )

            elif msg_type == "interrupt":
                # Frontend detected mic activity while guide was speaking.
                # Cancel the current response immediately.
                interrupt_count += 1
                last_interrupt_at = time.time()
                is_active = current_response is not None and not current_response.done() if current_response else False
                print(f"[{_ts()}][FE→BE] INTERRUPT #{interrupt_count} from frontend | response_active={is_active}")
                if current_response and not current_response.done():
                    print(f"[{_ts()}][VOICE] Frontend interrupt — cancelling response")
                    current_response.cancel()
                    try:
                        await current_response
                    except (asyncio.CancelledError, Exception):
                        pass
                    current_response = None

            elif msg_type == "phase":
                print(f"[{_ts()}][FE→BE] Phase update: {msg.get('phase')}")
                gemini.update_context(phase=msg.get("phase", "globe_selection"))

            elif msg_type == "session_start":
                # Frontend signals voice session should begin — send AI welcome
                time_period = msg.get("timePeriod", {})
                print(f"[{_ts()}][FE→BE] Session start: timePeriod={time_period}")
                gemini.update_context(
                    time_period=time_period.get("label", ""),
                    year=time_period.get("year", ""),
                    phase="globe_selection",
                )
                # Seed conversation with a synthetic user greeting
                gemini.conversation_history.append(
                    types.Content(role="user", parts=[types.Part(text="Hello! I just arrived.")])
                )
                current_response = asyncio.create_task(
                    _process_gemini_response(
                        None, websocket, gemini, gradium, world_labs, ws_closed, deezer
                    )
                )

            elif msg_type == "confirm_exploration":
                # User pressed "Enter" — trigger AI goodbye + session summary + loading messages + music
                print(f"[{_ts()}][FE→BE] User confirmed exploration")
                if current_response and not current_response.done():
                    current_response.cancel()
                    try:
                        await current_response
                    except (asyncio.CancelledError, Exception):
                        pass
                # Switch to transition phase — enables transition tool set
                gemini.update_context(phase="transition")
                # Inject system instruction for goodbye + all transition tool calls
                gemini.conversation_history.append(
                    types.Content(
                        role="user",
                        parts=[types.Part(text=(
                            "[System: The user has pressed the Enter button to confirm they want "
                            "to explore this location. Call ALL THREE tools in a single response:\n"
                            "   - summarize_session: include a warm goodbye_text (1-2 sentences, "
                            "reference something personal about the user), a detailed user_profile, "
                            "and an extremely detailed world_description (8-12 sentences describing "
                            "the scene for 3D generation — architecture, lighting, atmosphere, people, "
                            "textures, colors, weather, vegetation, everything a film set designer "
                            "would need)\n"
                            "   - generate_loading_messages: 15 short, cute loading messages "
                            "personalized to the user and destination (no periods, start with -ing verbs)\n"
                            "   - select_music: choose music matching the era, region, and mood. "
                            "Include song_suggestions — a list of 5 real song names (with artist) that "
                            "fit the destination. Format: 'Song Title - Artist'.\n"
                            "Do NOT generate any text outside of tool calls.]"
                        ))]
                    )
                )
                current_response = asyncio.create_task(
                    _process_gemini_response(
                        None, websocket, gemini, gradium, world_labs, ws_closed, deezer
                    )
                )

            elif msg_type == "explore_start":
                # Exploring phase: reconnected voice with Phase 1 context
                user_profile = msg.get("userProfile", "")
                world_desc = msg.get("worldDescription", "")
                loc = msg.get("location") or {}
                tp = msg.get("timePeriod") or {}
                print(f"[{_ts()}][FE→BE] Explore start: location={loc.get('name')}, era={tp.get('label')}")

                # Reset Gemini for fresh exploring session with Phase 1 context
                gemini.reset()
                gemini.update_context(
                    phase="exploring",
                    location_name=loc.get("name", ""),
                    lat=loc.get("lat", ""),
                    lng=loc.get("lng", ""),
                    time_period=tp.get("label", ""),
                    year=tp.get("year", ""),
                    user_profile=user_profile or "No profile available",
                    world_description=world_desc or "No description available",
                )
                # Seed with context about the user and world
                gemini.conversation_history.append(
                    types.Content(role="user", parts=[types.Part(text=(
                        f"[System: The traveller has arrived in the 3D world. "
                        f"Welcome them warmly to this historical moment. "
                        f"Share 1-2 interesting facts about this place using the generate_fact tool. "
                        f"Keep your spoken response to 2-3 vivid sentences.]"
                    ))])
                )
                current_response = asyncio.create_task(
                    _process_gemini_response(
                        None, websocket, gemini, gradium, world_labs, ws_closed, deezer,
                        frame_event=frame_event, frame_holder=frame_holder,
                    )
                )

            elif msg_type == "frame":
                # Canvas frame from frontend for Gemini visual context
                frame_holder["image"] = msg.get("image", "")
                frame_event.set()

            else:
                print(f"[{_ts()}][FE→BE] Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        print(f"[{_ts()}][VOICE] ========== WebSocket DISCONNECTED ==========")
    except Exception as e:
        print(f"[{_ts()}][VOICE] ========== ERROR: {type(e).__name__}: {e} ==========")
        import traceback
        traceback.print_exc()
    finally:
        ws_closed.set()
        if current_response and not current_response.done():
            current_response.cancel()
        if stt_stream:
            await stt_stream.close()
        print(f"[{_ts()}][VOICE] Session stats: {audio_msg_count} audio chunks, {turn_count} turns")
        print(f"[{_ts()}][VOICE] ========== CLEANUP COMPLETE ==========")
