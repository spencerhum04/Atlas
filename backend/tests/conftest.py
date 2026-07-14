"""Shared test fixtures and configuration."""

import os
import sys
from pathlib import Path

import pytest

# Add backend dir to path so imports work
sys.path.insert(0, str(Path(__file__).parent.parent))

# Load .env for test runs
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")


def has_api_key(key_name: str) -> bool:
    val = os.environ.get(key_name, "")
    return val != "" and val != "REPLACE_ME"


# Markers for skipping tests when API keys aren't configured
requires_gradium = pytest.mark.skipif(
    not has_api_key("GRADIUM_API_KEY"),
    reason="GRADIUM_API_KEY not set",
)

requires_gemini = pytest.mark.skipif(
    not has_api_key("GEMINI_API_KEY"),
    reason="GEMINI_API_KEY not set",
)

requires_world_labs = pytest.mark.skipif(
    not has_api_key("WORLD_LABS_API_KEY"),
    reason="WORLD_LABS_API_KEY not set",
)
