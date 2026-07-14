"""Tests for World Labs service (mocked — no real API calls to save credits)."""

import pytest

from services.world_labs import WorldLabsService


# Sample response matching current World Labs API schema
MOCK_WORLD_DATA = {
    "world_id": "world_abc123",
    "display_name": "QHacks World",
    "world_marble_url": "https://marble.worldlabs.ai/world/world_abc123",
    "assets": {
        "splats": {
            "spz_urls": {
                "100k": "https://cdn.worldlabs.ai/worlds/world_abc123/splats/100k.spz?sig=abc",
                "500k": "https://cdn.worldlabs.ai/worlds/world_abc123/splats/500k.spz?sig=def",
                "full_res": "https://cdn.worldlabs.ai/worlds/world_abc123/splats/full.spz?sig=ghi",
            }
        },
        "mesh": {
            "collider_mesh_url": "https://cdn.worldlabs.ai/worlds/world_abc123/mesh/collider.glb?sig=jkl"
        },
        "imagery": {
            "pano_url": "https://cdn.worldlabs.ai/worlds/world_abc123/imagery/panorama.jpg?sig=mno"
        },
        "caption": "The bustling Roman Forum at the height of the Empire.",
        "thumbnail_url": "https://cdn.worldlabs.ai/worlds/world_abc123/thumbnail.jpg?sig=pqr",
    },
}

MOCK_POLL_NOT_DONE = {
    "operation_id": "op_123",
    "done": False,
    "error": None,
    "response": None,
}

MOCK_POLL_DONE = {
    "operation_id": "op_123",
    "done": True,
    "error": None,
    "response": MOCK_WORLD_DATA,
}


def test_get_splat_url_500k():
    """Extract 500k resolution SPZ URL from world data."""
    url = WorldLabsService.get_splat_url(MOCK_WORLD_DATA, resolution="500k")
    assert url is not None
    assert "500k" in url
    print(f"\n  500k SPZ URL: {url}")


def test_get_splat_url_100k():
    """Extract 100k resolution SPZ URL."""
    url = WorldLabsService.get_splat_url(MOCK_WORLD_DATA, resolution="100k")
    assert url is not None
    assert "100k" in url


def test_get_splat_url_full():
    """Extract full resolution SPZ URL."""
    url = WorldLabsService.get_splat_url(MOCK_WORLD_DATA, resolution="full_res")
    assert url is not None
    assert "full" in url


def test_get_splat_url_fallback():
    """When requested resolution doesn't exist, fall back to last URL."""
    url = WorldLabsService.get_splat_url(MOCK_WORLD_DATA, resolution="2000k")
    assert url is not None
    # Should return the last URL (full resolution)
    assert "full" in url


def test_get_splat_url_from_legacy_list():
    """Support legacy list format for spz_urls as fallback compatibility."""
    legacy = {
        "assets": {
            "splats": {
                "spz_urls": [
                    "https://cdn.worldlabs.ai/worlds/world_abc123/splats/100k.spz?sig=abc",
                    "https://cdn.worldlabs.ai/worlds/world_abc123/splats/500k.spz?sig=def",
                    "https://cdn.worldlabs.ai/worlds/world_abc123/splats/full.spz?sig=ghi",
                ]
            }
        }
    }
    url = WorldLabsService.get_splat_url(legacy, resolution="500k")
    assert url is not None
    assert "500k" in url


def test_get_splat_url_empty_assets():
    """Handle world data with no SPZ URLs."""
    empty_data = {"assets": {"splats": {"spz_urls": {}}}}
    url = WorldLabsService.get_splat_url(empty_data)
    assert url is None


def test_get_splat_url_missing_assets():
    """Handle world data with missing assets key."""
    url = WorldLabsService.get_splat_url({})
    assert url is None


def test_service_headers():
    """Verify service constructs correct auth headers."""
    svc = WorldLabsService(api_key="WLT-test-key-123")
    assert svc._headers["WLT-Api-Key"] == "WLT-test-key-123"
    assert svc._headers["Content-Type"] == "application/json"


def test_world_data_structure():
    """Verify mock data matches expected schema from TECHNICAL.md."""
    assert "world_id" in MOCK_WORLD_DATA
    assert "display_name" in MOCK_WORLD_DATA
    assert "world_marble_url" in MOCK_WORLD_DATA
    assert "assets" in MOCK_WORLD_DATA
    assets = MOCK_WORLD_DATA["assets"]
    assert "splats" in assets
    assert "mesh" in assets
    assert "imagery" in assets
    assert "caption" in assets
    assert "thumbnail_url" in assets
    assert len(assets["splats"]["spz_urls"]) == 3  # 100k, 500k, full_res
