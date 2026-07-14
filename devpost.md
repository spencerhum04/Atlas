# Elevator pitch
Pick any location on the globe, choose any era, and step into an AI voice-guided, 3D-generated world that brings history and culture to life.

# About the project
## Inspiration
We kept coming back to one idea: our current prosperity did not appear overnight. It is the sum of countless moments, places, and people across history.  
Most people can read about history, but very few can *feel* what a place and time might have been like. We wanted to build a way to step into those moments and make history feel alive, personal, and accessible.

## What we built
We built an AI-guided exploration experience:
- Pick any country, province, city, or exact point on a 3D globe
- Talk to an AI guide by voice to choose the year and era you want to explore
- Enter hyperspace while your world is generated, with music tailored to that specific time, place, and culture
- Arrive inside a rendered 3D world generated for your exact coordinates and chosen moment in history

The full experience stays inside our app. No redirect is required to explore.

## How we built it
- Frontend: React + TypeScript + Three.js
- Globe phase: interactive Earth selection for location + year
- Voice loop (Gradium STT/TTS): low-latency, interruptible conversation so users can cut in at any time and still have a natural back-and-forth
- Core logic (Gemini API): instead of using Gemini as simple chat, we used it as the decision layer for guide behavior, prompts, and responses across every phase
- Gemini tool calling: drives globe suggestions (`suggest_location`), era-aware music (`select_music`), and world creation triggers (`trigger_world_generation`) so the map, audio, and generation pipeline stay in sync
- World generation: World Labs API with carefully engineered prompts that tightly anchor each world to the selected location, era, and cultural context
- World rendering: Spark.js + Three.js Gaussian splat rendering pipeline
- UX pipeline: starfield -> hyperspace -> loading narration -> exploration

## Challenges we faced
- Managing conversation state during interrupts: in edge cases, one user response could be interpreted as multiple turns and trigger overlapping AI replies
- Making WebSocket streaming robust on the frontend: without strict queueing and response-state control, audio/text events could arrive out of order and feel jumpy or buggy
- Debugging black-screen and splat artifact rendering issues in Spark integration
- Matching color and visual quality to the reference World Labs viewer
- Keeping logs useful while avoiding noise from unrelated subsystems

## What we learned
- Strong state transitions (landing page -> globe -> world) made the journey feel much more immersive.
- There is a real tradeoff between very low STT latency and system stability; reliability mattered more than raw speed.
- We learned to use tool calling much more effectively for structured actions like location selection and dynamic messaging.
- Orchestrating voice, world generation, and rendering required robust state management with graceful recovery paths.
- The best loading experience is still a meaningful experience: context-aware music and messages keep users engaged.
- Experiencing it ourselves showed how powerful this can be: landing anywhere with an AI voice guide feels special and creates a new way to learn history and culture.

# Built with
- TypeScript
- React
- Vite
- Three.js
- Spark.js
- Python (FastAPI backend)
- World Labs Marble API
- Gemini API
- Gradium voice APIs (STT/TTS)
- WebSockets

# Feedback (Technology 1: World Labs API)
World Labs was the core unlock for the project. The API is straightforward and gives us the right asset URLs to render in-app.  
The biggest pain point was renderer parity: generation worked quickly, but matching hosted-viewer visual behavior required extra tuning and deep debugging. Better official guidance on Spark parity presets would help teams move faster.

# Feedback (Technology 2: Gemini + Gradium)
Gemini was effective for conversational guide behavior and contextual phrase generation. Gradium made the voice loop feel natural with low enough latency for live interaction.  
The main challenge was operational: making sure key validity, stream handling, and log volume are tightly controlled during multi-phase flows.

# Did you implement a generative AI model or API in your hack this weekend?
Yes.

We used multiple generative systems in one pipeline:
- **World Labs API** to generate the 3D world assets from prompt context
- **Gemini API** for guide intelligence, narration, and dynamic loading phrases
- **Voice AI APIs** for spoken interaction

World Labs is especially exciting because the Marble API only launched on **January 20, 2026**, so we were building with a genuinely new tool and integrating it directly into our own renderer and UX flow.
