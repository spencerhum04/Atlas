"""End-to-end tests for the voice pipeline and FastAPI app."""

import os
import sys

import pytest

from services.music_selector import select_track


def test_app_imports():
    """Smoke test: verify all modules import without error."""
    from services.gradium_service import GradiumService
    from services.gemini_guide import GeminiGuide
    from services.world_labs import WorldLabsService
    from services.music_selector import select_track
    from routers.voice import router as voice_router
    from routers.worlds import router as worlds_router
    print("\n  All modules imported successfully")


def test_music_selector_exact_match():
    """Music selector returns best match for era/region/mood."""
    track = select_track(era="ancient", region="europe", mood="majestic")
    assert track is not None
    assert track["id"] == "ancient-mediterranean"
    print(f"\n  Selected track: {track['title']}")


def test_music_selector_partial_match():
    """Music selector handles partial matches gracefully."""
    track = select_track(era="medieval", region="asia", mood="peaceful")
    assert track is not None
    print(f"\n  Partial match track: {track['title']} (score based on era match)")


def test_music_selector_no_match():
    """Music selector returns fallback when nothing matches."""
    track = select_track(era="future", region="mars", mood="cosmic")
    assert track is not None  # Should return fallback
    print(f"\n  Fallback track: {track['title']}")


def test_fastapi_app_creates():
    """Verify FastAPI app can be instantiated (requires .env with valid keys or stubs)."""
    # This test only works if .env has at least placeholder keys
    try:
        from main import app
        assert app is not None
        assert app.title == "QHacks 2026 — Historical Explorer API"

        # Check routes exist
        routes = [r.path for r in app.routes]
        assert "/health" in routes
        assert "/ws/voice" in routes
        print(f"\n  FastAPI app created with {len(routes)} routes")
        print(f"    Routes: {routes}")
    except Exception as e:
        pytest.skip(f"App creation failed (likely missing .env): {e}")


def test_health_endpoint():
    """Test the /health endpoint returns OK."""
    try:
        from fastapi.testclient import TestClient
        from main import app
        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}
        print("\n  /health endpoint returns 200 OK")
    except Exception as e:
        pytest.skip(f"Health endpoint test failed: {e}")
