import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

GRADIUM_API_KEY = os.environ["GRADIUM_API_KEY"]
GEMINI_API_KEY = os.environ["GEMINI_API_KEY"]
WORLD_LABS_API_KEY = os.environ["WORLD_LABS_API_KEY"]
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")
