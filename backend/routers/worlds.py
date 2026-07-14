"""World generation REST endpoints.

Provides REST endpoints for the frontend to:
- Poll world generation status independently
- Fetch world assets

These supplement the WebSocket-based world status updates in voice.py.
See TECHNICAL.md Section 6 for World Labs API details.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import WORLD_LABS_API_KEY
from services.world_labs import WorldLabsService

router = APIRouter(prefix="/api/worlds", tags=["worlds"])
logger = logging.getLogger(__name__)

world_labs = WorldLabsService(api_key=WORLD_LABS_API_KEY)
HARDCODED_PROMPT_PATH = Path(__file__).resolve().parent.parent / "hardcoded_prompt.txt"


class GenerateRequest(BaseModel):
    scene_description: str
    display_name: str = "QHacks World"
    model: str = "Marble 0.1-mini"


class GenerateResponse(BaseModel):
    operation_id: str


class RenderableAssetsResponse(BaseModel):
    spz_urls: dict[str, str]
    default_spz_url: str | None = None
    collider_mesh_url: str | None = None
    pano_url: str | None = None
    thumbnail_url: str | None = None
    caption: str | None = None
    world_marble_url: str | None = None


class DebugPayloadResponse(BaseModel):
    operation: dict[str, Any] | None = None
    world: dict[str, Any] | None = None


class StatusResponse(BaseModel):
    done: bool
    status: str
    operation_id: str
    world_id: str | None = None
    display_name: str | None = None
    splat_url: str | None = None
    assets: RenderableAssetsResponse | None = None
    error: str | None = None
    debug: DebugPayloadResponse | None = None


def _read_hardcoded_prompt() -> str:
    if not HARDCODED_PROMPT_PATH.exists():
        raise HTTPException(
            status_code=500,
            detail=f"Missing hardcoded prompt file: {HARDCODED_PROMPT_PATH}",
        )
    prompt = HARDCODED_PROMPT_PATH.read_text(encoding="utf-8").strip()
    if not prompt:
        raise HTTPException(status_code=500, detail="hardcoded_prompt.txt is empty")
    return prompt


def _assets_debug_summary(world_data: dict[str, Any]) -> dict[str, Any]:
    assets = world_data.get("assets", {}) if isinstance(world_data, dict) else {}
    splats = assets.get("splats", {}) if isinstance(assets, dict) else {}
    mesh = assets.get("mesh", {}) if isinstance(assets, dict) else {}
    imagery = assets.get("imagery", {}) if isinstance(assets, dict) else {}

    return {
        "world_id": world_data.get("world_id") or world_data.get("id"),
        "display_name": world_data.get("display_name"),
        "world_marble_url": world_data.get("world_marble_url"),
        "spz_urls": splats.get("spz_urls"),
        "collider_mesh_url": mesh.get("collider_mesh_url"),
        "pano_url": imagery.get("pano_url"),
        "thumbnail_url": assets.get("thumbnail_url"),
        "caption_len": len(assets.get("caption", "") or ""),
    }


async def _build_status_response(operation_id: str, include_debug: bool = False) -> StatusResponse:
    operation = await world_labs.fetch_operation(operation_id)
    print(
        f"[WORLD-API] poll operation_id={operation_id} done={operation.get('done')} "
        f"error={operation.get('error')}"
    )
    logger.info(
        "[WORLD-API] poll operation_id=%s done=%s error=%s",
        operation_id,
        operation.get("done"),
        operation.get("error"),
    )

    if not operation.get("done"):
        return StatusResponse(
            done=False,
            status="generating",
            operation_id=operation_id,
            debug=DebugPayloadResponse(operation=operation) if include_debug else None,
        )

    if operation.get("error"):
        return StatusResponse(
            done=True,
            status="error",
            operation_id=operation_id,
            error=str(operation.get("error")),
            debug=DebugPayloadResponse(operation=operation) if include_debug else None,
        )

    operation_world = operation.get("response", {})
    world_id = WorldLabsService.extract_world_id(operation_world)
    if not world_id:
        raise HTTPException(
            status_code=500,
            detail=f"World Labs operation {operation_id} completed without world id",
        )

    # Official examples fetch /worlds/{world_id} after operation completion.
    world_data = await world_labs.get_world_assets(world_id)
    renderable_assets = WorldLabsService.extract_renderable_assets(world_data)
    print(f"[WORLD-API] ready operation_id={operation_id} world={_assets_debug_summary(world_data)}")
    logger.info(
        "[WORLD-API] ready operation_id=%s world=%s",
        operation_id,
        _assets_debug_summary(world_data),
    )

    return StatusResponse(
        done=True,
        status="ready",
        operation_id=operation_id,
        world_id=world_id,
        display_name=world_data.get("display_name"),
        splat_url=renderable_assets.get("default_spz_url"),
        assets=RenderableAssetsResponse(**renderable_assets),
        debug=DebugPayloadResponse(operation=operation, world=world_data) if include_debug else None,
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate_world(req: GenerateRequest):
    """Start world generation. Returns operation_id for polling."""
    try:
        operation_id = await world_labs.generate_world(
            scene_description=req.scene_description,
            display_name=req.display_name,
            model=req.model,
        )
        return GenerateResponse(operation_id=operation_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/hardcoded/start", response_model=GenerateResponse)
async def generate_world_from_hardcoded_prompt():
    """Start generation using backend-managed hardcoded_prompt.txt content."""
    try:
        prompt = _read_hardcoded_prompt()
        print(
            f"[WORLD-API] hardcoded start prompt_len={len(prompt)} "
            f"prompt_preview={prompt[:120]!r}"
        )
        logger.info(
            "[WORLD-API] hardcoded start prompt_len=%d prompt_preview=%r",
            len(prompt),
            prompt[:120],
        )
        operation_id = await world_labs.generate_world(
            scene_description=prompt,
            display_name="QHacks Hardcoded Prompt World",
            model="Marble 0.1-mini",
        )
        print(f"[WORLD-API] hardcoded start operation_id={operation_id}")
        logger.info("[WORLD-API] hardcoded start operation_id=%s", operation_id)
        return GenerateResponse(operation_id=operation_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{operation_id}", response_model=StatusResponse)
async def get_status(operation_id: str, debug: bool = False):
    """Check generation status without blocking (single poll, not loop)."""
    try:
        return await _build_status_response(operation_id, include_debug=debug)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hardcoded/status/{operation_id}", response_model=StatusResponse)
async def get_hardcoded_status(operation_id: str, debug: bool = False):
    """Poll hardcoded prompt generation status and return renderable assets when ready."""
    try:
        return await _build_status_response(operation_id, include_debug=debug)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
