from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import FRONTEND_URL
from routers import voice, worlds

app = FastAPI(title="QHacks 2026 — Historical Explorer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(voice.router)
app.include_router(worlds.router)



@app.get("/health")
async def health():
    return {"status": "ok"}
