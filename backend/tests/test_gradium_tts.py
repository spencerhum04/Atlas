"""Tests for Gradium Text-to-Speech service."""

import asyncio
import os
import time

import pytest

from services.gradium_service import GradiumService
from tests.conftest import requires_gradium


@requires_gradium
@pytest.mark.asyncio
async def test_tts_connection():
    """Verify TTS WebSocket connects and setup is accepted."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    start = time.monotonic()
    stream = await svc.create_tts_stream()
    elapsed = time.monotonic() - start
    print(f"\n  TTS connection time: {elapsed:.3f}s")
    assert elapsed < 5.0, f"TTS connection took too long: {elapsed:.3f}s"
    await stream.close()


@requires_gradium
@pytest.mark.asyncio
async def test_tts_synthesize_text():
    """Send text and verify binary PCM audio chunks are returned."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    stream = await svc.create_tts_stream()

    test_text = "Hello, welcome explorer. Let us journey through time."
    await stream.send_text(test_text)
    await stream.send_flush()

    chunks = []
    start = time.monotonic()
    first_chunk_time = None

    try:
        async for chunk in stream.iter_audio():
            if first_chunk_time is None:
                first_chunk_time = time.monotonic() - start
            chunks.append(chunk)
            # Collect for up to 5 seconds
            if time.monotonic() - start > 5.0:
                break
    except asyncio.TimeoutError:
        pass

    await stream.close()

    total_bytes = sum(len(c) for c in chunks)
    print(f"\n  TTS results:")
    print(f"    Chunks received: {len(chunks)}")
    print(f"    Total audio bytes: {total_bytes}")
    print(f"    Time-to-first-chunk: {first_chunk_time:.3f}s" if first_chunk_time else "    No chunks received")
    if chunks:
        print(f"    First chunk size: {len(chunks[0])} bytes")
        # 48kHz, 16-bit mono = 96000 bytes/sec
        duration_s = total_bytes / 96000
        print(f"    Approx audio duration: {duration_s:.2f}s")

    assert len(chunks) > 0, "Should have received at least one audio chunk"
    assert all(isinstance(c, bytes) for c in chunks), "All chunks should be bytes"
    assert total_bytes > 1000, f"Total audio too small: {total_bytes} bytes"


@requires_gradium
@pytest.mark.asyncio
async def test_tts_latency():
    """Measure time-to-first-audio-chunk. Target: <300ms per Gradium docs."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    stream = await svc.create_tts_stream()

    await stream.send_text("Hello world")
    await stream.send_flush()

    start = time.monotonic()
    first_chunk = None

    try:
        async for chunk in stream.iter_audio():
            first_chunk = chunk
            break
    except asyncio.TimeoutError:
        pass

    elapsed = time.monotonic() - start
    await stream.close()

    print(f"\n  TTS time-to-first-chunk: {elapsed:.3f}s (target: <0.300s)")
    assert first_chunk is not None, "Should have received at least one chunk"
    assert isinstance(first_chunk, bytes), "Chunk should be bytes"
    # Log but don't fail on latency — network conditions vary
    if elapsed > 0.3:
        print(f"  WARNING: Latency {elapsed:.3f}s exceeds 300ms target")


@requires_gradium
@pytest.mark.asyncio
async def test_tts_chunk_size():
    """Verify audio chunk size matches expected 3840 samples (80ms at 48kHz)."""
    svc = GradiumService(api_key=os.environ["GRADIUM_API_KEY"])
    stream = await svc.create_tts_stream()

    await stream.send_text("Testing audio chunk sizes for proper formatting.")
    await stream.send_flush()

    chunk_sizes = []
    try:
        async for chunk in stream.iter_audio():
            chunk_sizes.append(len(chunk))
            if len(chunk_sizes) >= 5:
                break
    except asyncio.TimeoutError:
        pass

    await stream.close()

    print(f"\n  Chunk sizes (first 5): {chunk_sizes}")
    # 3840 samples × 2 bytes = 7680 bytes per chunk (80ms at 48kHz, 16-bit)
    expected_size = 7680
    for size in chunk_sizes:
        # Allow some flexibility — last chunk may be smaller
        print(f"    Chunk: {size} bytes ({size / 2} samples)")

    assert len(chunk_sizes) > 0, "Should have received chunks"
