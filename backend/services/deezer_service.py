"""Deezer search integration — no authentication required.

Uses the public Deezer search API to find tracks with 30-second MP3 previews.
Preview URLs are direct links to CDN-hosted MP3 files that HTML5 Audio can play.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger(__name__)

DEEZER_SEARCH_URL = "https://api.deezer.com/search"


class DeezerService:
    """Stateless Deezer search client. No API key or auth required."""

    async def search_tracks(self, query: str, limit: int = 5) -> list[dict]:
        """Search the Deezer catalog for tracks matching a query.

        Returns a list of dicts: [{preview_url, title, artist, album_art}].
        Filters out tracks with no preview URL.
        """
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(
                    DEEZER_SEARCH_URL,
                    params={"q": query, "limit": limit},
                )

            if resp.status_code != 200:
                print(f"[DEEZER] Search FAILED: HTTP {resp.status_code} — {resp.text[:200]}")
                return []

            data = resp.json()
            tracks = []
            for item in data.get("data", []):
                preview = item.get("preview")
                if not preview:
                    continue
                tracks.append({
                    "preview_url": preview,
                    "title": item.get("title", "Unknown"),
                    "artist": item.get("artist", {}).get("name", "Unknown"),
                    "album_art": item.get("album", {}).get("cover_medium"),
                })

            print(f"[DEEZER] Search '{query}': {len(tracks)} results")
            if tracks:
                print(f"[DEEZER]   Top result: \"{tracks[0]['title']}\" by {tracks[0]['artist']}")
                print(f"[DEEZER]   Preview URL: {tracks[0]['preview_url']}")
            return tracks

        except Exception as e:
            print(f"[DEEZER] Search ERROR: {e}")
            return []
