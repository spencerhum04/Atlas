"""World Labs Marble API client.

Handles 3D world generation, status polling, and asset retrieval.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://api.worldlabs.ai/marble/v1"
POLL_INTERVAL_S = 5
MAX_POLL_ATTEMPTS = 120  # 10 minutes max


class WorldLabsService:
    """Client for World Labs Marble API."""

    def __init__(self, api_key: str):
        self.api_key = api_key
        self._headers = {
            "WLT-Api-Key": api_key,
            "Content-Type": "application/json",
        }

    async def generate_world(
        self,
        scene_description: str,
        display_name: str = "QHacks World",
        model: str = "Marble 0.1-mini",
    ) -> str:
        """Start world generation. Returns operation_id for polling."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{BASE_URL}/worlds:generate",
                headers=self._headers,
                json={
                    "display_name": display_name,
                    "world_prompt": {
                        "type": "text",
                        "text_prompt": scene_description,
                    },
                    "model": model,
                },
            )
            response.raise_for_status()
            data = response.json()
            operation_id = data["operation_id"]
            logger.info("World generation started: operation_id=%s", operation_id)
            return operation_id

    async def poll_status(self, operation_id: str) -> dict:
        """Poll until generation is done. Returns the world result dict."""
        async with httpx.AsyncClient(timeout=30) as client:
            for attempt in range(MAX_POLL_ATTEMPTS):
                data = await self.fetch_operation(operation_id, client=client)

                if data.get("done"):
                    if data.get("error"):
                        raise RuntimeError(f"World generation failed: {data['error']}")
                    logger.info(
                        "World generation complete: operation_id=%s (attempt %d)",
                        operation_id,
                        attempt + 1,
                    )
                    return data["response"]

                logger.debug(
                    "Polling operation_id=%s — not done yet (attempt %d)",
                    operation_id,
                    attempt + 1,
                )
                await asyncio.sleep(POLL_INTERVAL_S)

            raise TimeoutError(
                f"World generation timed out after {MAX_POLL_ATTEMPTS * POLL_INTERVAL_S}s"
            )

    async def fetch_operation(
        self,
        operation_id: str,
        *,
        client: httpx.AsyncClient | None = None,
    ) -> dict:
        """Fetch operation status once."""
        if client is not None:
            response = await client.get(
                f"{BASE_URL}/operations/{operation_id}",
                headers=self._headers,
            )
            response.raise_for_status()
            return response.json()

        async with httpx.AsyncClient(timeout=30) as new_client:
            response = await new_client.get(
                f"{BASE_URL}/operations/{operation_id}",
                headers=self._headers,
            )
            response.raise_for_status()
            return response.json()

    async def get_world_assets(self, world_id: str) -> dict:
        """Fetch world details including asset URLs."""
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.get(
                f"{BASE_URL}/worlds/{world_id}",
                headers=self._headers,
            )
            response.raise_for_status()
            return response.json()

    @staticmethod
    def extract_world_id(world_data: dict[str, Any]) -> str | None:
        """Extract world id from either world object or operation response payload."""
        return (
            world_data.get("world_id")
            or world_data.get("id")
            or world_data.get("response", {}).get("world_id")
            or world_data.get("response", {}).get("id")
        )

    @staticmethod
    def extract_splat_urls(world_data: dict[str, Any]) -> dict[str, str]:
        """Normalize splat URL formats from World Labs responses.

        Official API currently returns:
          assets.splats.spz_urls = { "100k": "...", "500k": "...", "full_res": "..." }
        Older examples/docs used a list of URLs. We support both.
        """
        raw = world_data.get("assets", {}).get("splats", {}).get("spz_urls")
        if isinstance(raw, dict):
            return {
                str(key): str(value)
                for key, value in raw.items()
                if isinstance(value, str) and value
            }

        if isinstance(raw, list):
            normalized: dict[str, str] = {}
            for url in raw:
                if not isinstance(url, str) or not url:
                    continue
                if "100k" in url:
                    normalized["100k"] = url
                elif "500k" in url:
                    normalized["500k"] = url
                elif "full" in url:
                    normalized["full_res"] = url
                else:
                    normalized[str(len(normalized))] = url
            return normalized

        return {}

    @staticmethod
    def get_splat_url(world_data: dict[str, Any], resolution: str = "500k") -> str | None:
        """Pick a splat URL from normalized assets by preferred resolution."""
        urls = WorldLabsService.extract_splat_urls(world_data)
        if not urls:
            return None

        if resolution in urls:
            return urls[resolution]
        if resolution == "full" and "full_res" in urls:
            return urls["full_res"]
        if resolution == "full_res" and "full" in urls:
            return urls["full"]

        for key in ("full_res", "500k", "100k", "full"):
            if key in urls:
                return urls[key]
        return next(iter(urls.values()), None)

    @staticmethod
    def extract_renderable_assets(world_data: dict[str, Any]) -> dict[str, Any]:
        """Extract asset URLs the frontend can render locally."""
        assets = world_data.get("assets", {}) if isinstance(world_data, dict) else {}
        splat_urls = WorldLabsService.extract_splat_urls(world_data)

        mesh = assets.get("mesh", {}) if isinstance(assets, dict) else {}
        imagery = assets.get("imagery", {}) if isinstance(assets, dict) else {}

        return {
            "spz_urls": splat_urls,
            "default_spz_url": (
                splat_urls.get("full_res")
                or splat_urls.get("500k")
                or splat_urls.get("100k")
                or next(iter(splat_urls.values()), None)
            ),
            "collider_mesh_url": mesh.get("collider_mesh_url"),
            "pano_url": imagery.get("pano_url"),
            "thumbnail_url": assets.get("thumbnail_url"),
            "caption": assets.get("caption"),
            # Returned for traceability, but frontend must not redirect to it.
            "world_marble_url": world_data.get("world_marble_url"),
        }
