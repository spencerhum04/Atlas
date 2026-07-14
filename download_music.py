#!/usr/bin/env python3
import subprocess
import os
import sys

music_dir = "/Users/matthewlones/git/hackathons/QHacks-2026/frontend/public/music"
os.makedirs(music_dir, exist_ok=True)

tracks = [
    {
        "name": "renaissance",
        "search": "ytsearch1:renaissance baroque classical elegant ambient background music",
        "output": os.path.join(music_dir, "renaissance.mp3"),
    },
    {
        "name": "east-asian",
        "search": "ytsearch1:japanese koto ambient music traditional guzheng",
        "output": os.path.join(music_dir, "east-asian.mp3"),
    },
]

for track in tracks:
    print(f"\n=== Downloading {track['name']} ===")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "-x", "--audio-format", "mp3", "--audio-quality", "5",
        "-o", track["output"],
        track["search"],
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        print(result.stdout)
        if result.stderr:
            print(result.stderr)
    except Exception as e:
        print(f"Error: {e}")

# Verify
print("\n=== Verification ===")
for track in tracks:
    exists = os.path.exists(track["output"])
    if exists:
        size = os.path.getsize(track["output"])
        print(f"{track['name']}: EXISTS ({size} bytes)")
    else:
        print(f"{track['name']}: MISSING")
