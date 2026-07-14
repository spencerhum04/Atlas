"""Music track selector.

Matches era/region/mood to curated royalty-free tracks.
Stub for Phase 1 — will be fleshed out in Phase 3 when tracks are sourced.

See TECHNICAL.md Section 7 for library structure and selection flow.
"""

from __future__ import annotations

import logging

logger = logging.getLogger(__name__)

MUSIC_LIBRARY: list[dict] = [
    {
        "id": "ancient-mediterranean",
        "title": "Echoes of Antiquity",
        "file": "/music/ancient-mediterranean.mp3",
        "era": "ancient",
        "region": "europe",
        "mood": "majestic",
    },
    {
        "id": "ancient-egypt",
        "title": "Sands of Time",
        "file": "/music/ancient-egypt.mp3",
        "era": "ancient",
        "region": "middle_east",
        "mood": "contemplative",
    },
    {
        "id": "medieval-europe",
        "title": "Stone Corridors",
        "file": "/music/medieval-europe.mp3",
        "era": "medieval",
        "region": "europe",
        "mood": "contemplative",
    },
    {
        "id": "renaissance",
        "title": "Age of Discovery",
        "file": "/music/renaissance.mp3",
        "era": "renaissance",
        "region": "europe",
        "mood": "majestic",
    },
    {
        "id": "east-asian",
        "title": "Eastern Winds",
        "file": "/music/east-asian.mp3",
        "era": "ancient",
        "region": "asia",
        "mood": "peaceful",
    },
    {
        "id": "modern-cinematic",
        "title": "New Horizons",
        "file": "/music/modern-cinematic.mp3",
        "era": "modern",
        "region": "global",
        "mood": "adventurous",
    },
    {
        "id": "dramatic-epic",
        "title": "The Grand March",
        "file": "/music/dramatic-epic.mp3",
        "era": "classical",
        "region": "global",
        "mood": "dramatic",
    },
]


def select_track(era: str, region: str, mood: str) -> dict | None:
    """Find the best matching track for the given era, region, and mood.

    Scoring: +2 for era match, +1 for region match, +1 for mood match.
    Returns the highest-scoring track, or None if library is empty.
    """
    if not MUSIC_LIBRARY:
        return None

    def score(track: dict) -> int:
        s = 0
        if track["era"].lower() == era.lower():
            s += 2
        if track["region"].lower() == region.lower():
            s += 1
        if track["mood"].lower() == mood.lower():
            s += 1
        return s

    best = max(MUSIC_LIBRARY, key=score)
    if score(best) == 0:
        # No match at all — return first track as fallback
        return MUSIC_LIBRARY[0]
    return best
