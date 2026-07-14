#!/bin/bash
# Download renaissance/classical ambient music
yt-dlp -x --audio-format mp3 --audio-quality 5 \
  -o "/Users/matthewlones/git/hackathons/QHacks-2026/frontend/public/music/renaissance.mp3" \
  "ytsearch1:renaissance baroque classical elegant ambient background music" 2>&1

echo "---SEPARATOR---"

# Download East Asian ambient music
yt-dlp -x --audio-format mp3 --audio-quality 5 \
  -o "/Users/matthewlones/git/hackathons/QHacks-2026/frontend/public/music/east-asian.mp3" \
  "ytsearch1:japanese koto ambient music traditional guzheng" 2>&1

echo "---SEPARATOR---"

# Verify both files exist
ls -la /Users/matthewlones/git/hackathons/QHacks-2026/frontend/public/music/
