"""Tests for Gradium Speech-to-Text service."""

import asyncio
import os
import struct
import time

import pytest

from services.gradium_service import GradiumService
from tests.conftest import requires_gradium


@requires_gradium
@pytest.mark.asyncio
async def test_stt_connection():
    """Verify STT WebSocket connects and setup is accepted."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    start = time.monotonic()
    stream = await svc.create_stt_stream()
    elapsed = time.monotonic() - start
    print(f"\n  STT connection time: {elapsed:.3f}s")
    assert elapsed < 5.0, f"STT connection took too long: {elapsed:.3f}s"
    await stream.close()


@requires_gradium
@pytest.mark.asyncio
async def test_stt_receives_vad_on_silence():
    """Send silent audio and verify VAD messages are received."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    stream = await svc.create_stt_stream()

    # Generate 500ms of silence (24kHz, 16-bit, mono)
    num_samples = 24000 // 2  # 500ms
    silence = struct.pack(f"<{num_samples}h", *([0] * num_samples))

    # Send silence in ~80ms chunks (1920 samples = 3840 bytes)
    chunk_size = 3840
    for i in range(0, len(silence), chunk_size):
        await stream.send_audio(silence[i:i + chunk_size])
        await asyncio.sleep(0.01)

    # Wait for a VAD response
    received_vad = False
    try:
        for _ in range(20):  # Try up to 20 messages
            msg = await asyncio.wait_for(stream.receive(), timeout=2.0)
            if msg.get("type") == "step":
                received_vad = True
                vad = msg.get("vad", [])
                print(f"\n  VAD message received: {vad}")
                assert len(vad) >= 3, "VAD message should have 3 elements"
                assert "inactivity_prob" in vad[2], "VAD should contain inactivity_prob"
                break
    except asyncio.TimeoutError:
        pass

    await stream.close()
    assert received_vad, "Should have received at least one VAD message"


@requires_gradium
@pytest.mark.asyncio
async def test_stt_transcript_on_audio():
    """Send speech-like audio (tone) and verify we get a response (may be empty transcript for non-speech)."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    stream = await svc.create_stt_stream()

    # Generate 1 second of a 440Hz sine wave as rough "audio activity"
    import math
    num_samples = 24000
    samples = [int(16000 * math.sin(2 * math.pi * 440 * i / 24000)) for i in range(num_samples)]
    audio = struct.pack(f"<{num_samples}h", *samples)

    # Send in chunks
    chunk_size = 3840
    for i in range(0, len(audio), chunk_size):
        await stream.send_audio(audio[i:i + chunk_size])
        await asyncio.sleep(0.01)

    # Collect messages for 3 seconds
    messages = []
    try:
        while True:
            msg = await asyncio.wait_for(stream.receive(), timeout=3.0)
            messages.append(msg)
    except asyncio.TimeoutError:
        pass

    await stream.close()

    print(f"\n  Received {len(messages)} messages from STT")
    for m in messages[:5]:
        print(f"    {m.get('type')}: {str(m)[:100]}")

    # Should have received at least some messages (VAD or text)
    assert len(messages) > 0, "Should have received at least one message from STT"
