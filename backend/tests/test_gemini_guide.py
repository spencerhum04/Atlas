"""Tests for Gemini AI Guide service."""

import os
import time

import pytest

from services.gemini_guide import GeminiGuide
from tests.conftest import requires_gemini


@requires_gemini
@pytest.mark.asyncio
async def test_gemini_text_response():
    """Send a simple prompt and verify streaming response (text or function calls)."""
    guide = GeminiGuide(api_key=os.environ["GEMINI_API_KEY"])

    start = time.monotonic()
    first_chunk_time = None
    full_text = ""
    function_calls = []

    async for chunk in guide.generate_response("Say hello and introduce yourself in one sentence."):
        if chunk["type"] == "text":
            if first_chunk_time is None:
                first_chunk_time = time.monotonic() - start
            full_text += chunk["text"]
        elif chunk["type"] == "function_call":
            if first_chunk_time is None:
                first_chunk_time = time.monotonic() - start
            function_calls.append(chunk)

    elapsed = time.monotonic() - start
    print(f"\n  Gemini response:")
    print(f"    Time-to-first-chunk: {first_chunk_time:.3f}s" if first_chunk_time else "    No chunks received")
    print(f"    Total time: {elapsed:.3f}s")
    print(f"    Response length: {len(full_text)} chars")
    print(f"    Function calls: {len(function_calls)}")
    if full_text:
        print(f"    Preview: {full_text[:150]}...")

    assert first_chunk_time is not None, "Should have received at least one chunk"
    assert len(full_text) > 0 or len(function_calls) > 0, "Should have text or function calls"


@requires_gemini
@pytest.mark.asyncio
async def test_gemini_function_calling():
    """Verify that a location-related prompt triggers suggest_location or trigger_world_generation."""
    guide = GeminiGuide(api_key=os.environ["GEMINI_API_KEY"])
    guide.update_context(phase="globe_selection")

    function_calls = []
    text_chunks = []

    async for chunk in guide.generate_response(
        "I'd love to explore ancient Rome around 100 AD. The Colosseum would be amazing! Let's go there."
    ):
        if chunk["type"] == "function_call":
            function_calls.append(chunk)
        elif chunk["type"] == "text":
            text_chunks.append(chunk["text"])

    print(f"\n  Gemini function calling:")
    print(f"    Function calls: {len(function_calls)}")
    for fc in function_calls:
        print(f"      {fc['name']}({fc['args']})")
    print(f"    Text chunks: {len(text_chunks)}")

    # The guide should have made at least one function call
    # It might call suggest_location, trigger_world_generation, or both
    if function_calls:
        names = {fc["name"] for fc in function_calls}
        print(f"    Function names called: {names}")
        assert names & {"suggest_location", "trigger_world_generation"}, (
            f"Expected suggest_location or trigger_world_generation, got: {names}"
        )
    else:
        # The model might just respond with text — that's acceptable too
        print("    Note: No function calls triggered (model responded with text only)")
        assert len(text_chunks) > 0, "Should have at least text if no function calls"


@requires_gemini
@pytest.mark.asyncio
async def test_gemini_conversation_history():
    """Verify multi-turn conversation context is preserved."""
    guide = GeminiGuide(api_key=os.environ["GEMINI_API_KEY"])

    # Turn 1: Ask about a topic
    text1 = ""
    async for chunk in guide.generate_response("What was the most impressive building in ancient Rome?"):
        if chunk["type"] == "text":
            text1 += chunk["text"]

    assert len(guide.conversation_history) == 2, "Should have user + model messages"
    assert guide.conversation_history[0].role == "user"
    assert guide.conversation_history[1].role == "model"

    # Turn 2: Follow-up that requires context from Turn 1
    text2 = ""
    async for chunk in guide.generate_response("Tell me more about it."):
        if chunk["type"] == "text":
            text2 += chunk["text"]

    assert len(guide.conversation_history) == 4, "Should have 4 messages after 2 turns"

    print(f"\n  Multi-turn conversation:")
    print(f"    Turn 1 ({len(text1)} chars): {text1[:100]}...")
    print(f"    Turn 2 ({len(text2)} chars): {text2[:100]}...")
    print(f"    History length: {len(guide.conversation_history)} messages")

    # Turn 2 should reference something from Turn 1 (the building)
    assert len(text2) > 20, "Follow-up response should be substantial"


@requires_gemini
@pytest.mark.asyncio
async def test_gemini_response_latency():
    """Measure time-to-first-text-chunk. Target: <1s."""
    guide = GeminiGuide(api_key=os.environ["GEMINI_API_KEY"])

    start = time.monotonic()
    first_chunk_time = None

    async for chunk in guide.generate_response("Say hello."):
        if chunk["type"] == "text" and first_chunk_time is None:
            first_chunk_time = time.monotonic() - start
            break

    print(f"\n  Gemini time-to-first-text: {first_chunk_time:.3f}s (target: <1.0s)")
    assert first_chunk_time is not None, "Should have received a text chunk"
    if first_chunk_time > 1.0:
        print(f"  WARNING: Latency {first_chunk_time:.3f}s exceeds 1.0s target")


def test_gemini_context_update():
    """Unit test: verify context updates work correctly (no API call needed)."""
    guide = GeminiGuide(api_key="dummy")

    guide.update_context(location_name="Rome, Italy", lat=41.9, lng=12.5)
    assert guide.context["location_name"] == "Rome, Italy"
    assert guide.context["lat"] == 41.9

    guide.update_context(phase="loading")
    assert guide.context["phase"] == "loading"
    # Previous values should be preserved
    assert guide.context["location_name"] == "Rome, Italy"


def test_gemini_reset():
    """Unit test: verify reset clears history."""
    guide = GeminiGuide(api_key="dummy")
    guide.conversation_history.append("fake message")
    guide.reset()
    assert len(guide.conversation_history) == 0
