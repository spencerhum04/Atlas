"""Gradium STT/TTS WebSocket client.

Wraps the Gradium Python SDK for streaming speech-to-text and text-to-speech.
See TECHNICAL.md Section 4 for protocol details.

Audio formats:
  STT input:  PCM 24kHz, 16-bit signed int, mono
  TTS output: PCM 48kHz, 16-bit signed int, mono (binary chunks, 3840 samples = 80ms)
"""

from __future__ import annotations

import base64
import json
import logging
from typing import AsyncGenerator

import websockets

logger = logging.getLogger(__name__)

# Gradium WebSocket endpoints (US region)
STT_URL = "wss://us.api.gradium.ai/api/speech/asr"
TTS_URL = "wss://us.api.gradium.ai/api/speech/tts"

DEFAULT_VOICE_ID = "YTpq7expH9539ERJ"  # Emma, English, Female, US


class GradiumSTTStream:
    """Manages a single STT WebSocket session."""

    def __init__(self, ws: websockets.WebSocketClientProtocol):
        self._ws = ws

    async def send_audio(self, pcm_bytes: bytes) -> None:
        """Send a PCM audio chunk (24kHz, 16-bit, mono) to STT."""
        encoded = base64.b64encode(pcm_bytes).decode("ascii")
        await self._ws.send(json.dumps({"type": "audio", "audio": encoded}))

    async def receive(self) -> dict:
        """Receive next message from STT (transcript or VAD)."""
        raw = await self._ws.recv()
        return json.loads(raw)

    async def close(self) -> None:
        await self._ws.close()


class GradiumTTSStream:
    """Manages a single TTS WebSocket session.

    Audio arrives as JSON text frames: {"type": "audio", "audio": "<base64>"}
    NOT as raw binary WebSocket frames.
    """

    def __init__(self, ws: websockets.WebSocketClientProtocol):
        self._ws = ws

    async def send_text(self, text: str) -> None:
        """Send text to synthesise."""
        await self._ws.send(json.dumps({"type": "text", "text": text}))

    async def send_flush(self) -> None:
        """Signal end of text input. Server will finish synthesis then close."""
        await self._ws.send(json.dumps({"type": "end_of_stream"}))

    async def receive_audio(self) -> bytes | None:
        """Receive next PCM audio chunk (decoded from base64 JSON). Returns None on close."""
        try:
            data = await self._ws.recv()
            msg = json.loads(data) if isinstance(data, str) else None
            if msg and msg.get("type") == "audio" and msg.get("audio"):
                return base64.b64decode(msg["audio"])
            return None
        except (websockets.ConnectionClosed, json.JSONDecodeError):
            return None

    async def iter_audio(self) -> AsyncGenerator[tuple[str, bytes | dict], None]:
        """Iterate over audio chunks and word timestamps until close.

        Yields:
            ("audio", pcm_bytes) for audio data
            ("timestamp", {"text": str, "start_s": float, "stop_s": float}) for word timing
        """
        while True:
            try:
                data = await self._ws.recv()
                if isinstance(data, str):
                    msg = json.loads(data)
                    if msg.get("type") == "audio" and msg.get("audio"):
                        yield ("audio", base64.b64decode(msg["audio"]))
                    elif msg.get("type") == "text" and "start_s" in msg:
                        yield ("timestamp", {
                            "text": msg["text"],
                            "start_s": msg["start_s"],
                            "stop_s": msg["stop_s"],
                        })
                    elif msg.get("type") == "end_of_stream":
                        break
                elif isinstance(data, bytes):
                    # Fallback: some formats may send raw binary
                    yield ("audio", data)
            except (websockets.ConnectionClosed, json.JSONDecodeError):
                break

    async def close(self) -> None:
        await self._ws.close()


class GradiumService:
    """Factory for STT and TTS streaming sessions."""

    def __init__(self, api_key: str, region: str = "us"):
        self.api_key = api_key
        self.region = region
        self._stt_url = STT_URL if region == "us" else STT_URL.replace("us.", "eu.")
        self._tts_url = TTS_URL if region == "us" else TTS_URL.replace("us.", "eu.")

    async def create_stt_stream(self) -> GradiumSTTStream:
        """Open a new STT WebSocket and send the required setup message."""
        ws = await websockets.connect(
            self._stt_url,
            additional_headers={"x-api-key": self.api_key},
        )
        # Setup MUST be first message — server closes connection otherwise.
        await ws.send(json.dumps({
            "type": "setup",
            "model_name": "default",
            "input_format": "pcm",
            "language": "en",
        }))
        return GradiumSTTStream(ws)

    async def create_tts_stream(
        self, voice_id: str = DEFAULT_VOICE_ID
    ) -> GradiumTTSStream:
        """Open a new TTS WebSocket and send the required setup message."""
        ws = await websockets.connect(
            self._tts_url,
            additional_headers={"x-api-key": self.api_key},
        )
        # Setup MUST be first message.
        await ws.send(json.dumps({
            "type": "setup",
            "voice_id": voice_id,
            "model_name": "default",
            "output_format": "pcm",
        }))
        # Wait for "ready" confirmation before returning
        raw = await ws.recv()
        msg = json.loads(raw)
        if msg.get("type") != "ready":
            error_detail = msg.get("message", msg.get("error", str(msg)))
            logger.error("TTS setup failed: %s — %s", msg.get("type"), error_detail)
            await ws.close()
            raise ConnectionError(f"Gradium TTS setup failed: {error_detail}")
        return GradiumTTSStream(ws)

    async def tts_synthesize(
        self, text: str, voice_id: str = DEFAULT_VOICE_ID
    ) -> AsyncGenerator[bytes, None]:
        """Convenience: synthesize text and yield audio chunks (timestamps discarded)."""
        stream = await self.create_tts_stream(voice_id)
        try:
            await stream.send_text(text)
            await stream.send_flush()
            async for msg_type, payload in stream.iter_audio():
                if msg_type == "audio":
                    yield payload  # type: ignore[misc]
        finally:
            await stream.close()
