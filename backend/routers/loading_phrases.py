"""Loading phrases REST endpoints.

Generates short rotating loading phrases for the hyperspace loading screen.
Uses Gemini via google-genai with a strict JSON-only response format.
"""

from __future__ import annotations

import json
import logging
import re
from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from config import GEMINI_API_KEY

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/loading", tags=["loading"])

_SYSTEM_PROMPT = """You write short rotating loading phrases for a time-travel
exploration UI. The phrases must be historically plausible for the given
location and year.

Rules:
- Output ONLY a JSON array of strings. No extra text.
- Each string is a short action phrase in lowercase.
- Start each phrase with an action verb in present participle (ending in "ing").
- End every phrase with "..." (three dots).
- Keep phrases concise (about 4 to 10 words).
- Avoid anachronisms, modern references, or proper nouns unless necessary.
- Avoid repeating the same starting verb across the list.
"""


class LoadingPhrasesRequest(BaseModel):
    location: str = Field(..., description="Human-readable location (e.g., 'Athens, Greece')")
    year: int = Field(..., description="Year (negative for BCE)")
    era: str | None = Field(None, description="Optional era label")
    lat: float | None = Field(None, description="Latitude (optional)")
    lng: float | None = Field(None, description="Longitude (optional)")
    count: int = Field(14, description="Number of phrases to generate (6-20)")


class LoadingPhrasesResponse(BaseModel):
    phrases: List[str]


def _clamp_count(count: int) -> int:
    return max(6, min(20, count))


def _sanitize_phrase(phrase: str) -> str:
    cleaned = phrase.strip().strip('"').strip()
    cleaned = cleaned.lower()
    cleaned = re.sub(r"^[\s\-\u2013\u2014\|\u2502\u00a6\u2022•·▏▌▍▎▏]+", "", cleaned)
    if not cleaned.endswith("..."):
        cleaned = cleaned.rstrip(".") + "..."
    return cleaned


def _fallback_phrases(location: str) -> list[str]:
    loc = location.strip() or "the horizon"
    return [
        f"gathering supplies for {loc.lower()}...",
        "checking maps under starlight...",
        "tightening straps on worn satchels...",
        "listening for distant footsteps...",
        "preparing provisions for the road...",
        "studying landmarks in the dark...",
        "packing tools for the journey...",
        "steadying breath before the crossing...",
        "tracing routes across the landscape...",
        "waiting for the right moment...",
    ]


@router.post("/phrases", response_model=LoadingPhrasesResponse)
async def generate_loading_phrases(req: LoadingPhrasesRequest):
    """Generate a list of loading phrases via Gemini."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")

    count = _clamp_count(req.count)
    client = genai.Client(api_key=GEMINI_API_KEY)

    context_lines = [
        f"Location: {req.location}",
        f"Year: {req.year}",
    ]
    if req.era:
        context_lines.append(f"Era: {req.era}")
    if req.lat is not None and req.lng is not None:
        context_lines.append(f"Coordinates: {req.lat}, {req.lng}")

    user_text = "\n".join(context_lines) + f"\nReturn {count} phrases."

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[types.Content(role="user", parts=[types.Part(text=user_text)])],
            config=types.GenerateContentConfig(
                system_instruction=_SYSTEM_PROMPT,
            ),
        )
    except Exception as exc:
        logger.error("Gemini loading phrases failed: %s", exc)
        return LoadingPhrasesResponse(phrases=_fallback_phrases(req.location))

    raw_text = getattr(response, "text", "") or ""
    if not raw_text and getattr(response, "candidates", None):
        parts = []
        for cand in response.candidates:
            content = getattr(cand, "content", None)
            if not content:
                continue
            for part in getattr(content, "parts", []) or []:
                if getattr(part, "text", None):
                    parts.append(part.text)
        raw_text = "".join(parts)

    phrases: list[str] = []
    try:
        phrases = json.loads(raw_text)
    except Exception:
        match = re.search(r"\[[\s\S]*\]", raw_text)
        if match:
            try:
                phrases = json.loads(match.group(0))
            except Exception:
                phrases = []

    if not isinstance(phrases, list) or not phrases:
        return LoadingPhrasesResponse(phrases=_fallback_phrases(req.location))

    cleaned = [_sanitize_phrase(p) for p in phrases if isinstance(p, str)]
    cleaned = [p for p in cleaned if p]

    if not cleaned:
        return LoadingPhrasesResponse(phrases=_fallback_phrases(req.location))

    return LoadingPhrasesResponse(phrases=cleaned[:count])
