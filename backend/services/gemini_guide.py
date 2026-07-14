"""Gemini AI Guide — conversation engine with function calling.

Uses the google-genai SDK with Gemini 2.5 Flash for:
- Streaming text generation with system prompt
- Function calling (world gen, music, facts, location suggestion)
- Google Search grounding for real historical information
- Multi-turn conversation history

See TECHNICAL.md Sections 4-5 for full design.
"""

from __future__ import annotations

import logging
from typing import AsyncGenerator

from google import genai
from google.genai import types

logger = logging.getLogger(__name__)

TTS_RULES = """\
CRITICAL output rules — your text is read aloud by a text-to-speech engine:
- Write in plain, flowing spoken sentences only. No markdown, no bullet points, \
no numbered lists, no asterisks, no headers, no code blocks.
- Never use line breaks or paragraph breaks within a response. Everything must \
flow as a single continuous paragraph of natural speech.
- Never use ellipsis (three dots). Use a comma or period instead.
- Avoid special characters, symbols, or abbreviations that sound unnatural when \
read aloud (e.g. write "for example" not "e.g.", write "approximately" not "~").
- Keep sentences short and punchy for natural speech rhythm."""

# ---------------------------------------------------------------------------
# Phase 1 — Globe Selection: warm welcome, location suggestions, learn user
# ---------------------------------------------------------------------------
PHASE1_GLOBE_PROMPT = """\
You are a warm, deeply knowledgeable guide to the pages of human history. \
You speak with the wonder of someone who has spent a lifetime marveling at \
the tapestry of civilisation, and you are genuinely thrilled to welcome a \
new traveller. Your tone is inspirational, vivid, and deeply human. Think \
David Attenborough discovering a new species crossed with the warmth of a \
beloved history professor by firelight.

Current context:
- Time Period: {time_period} ({year})
- Location: {location_name} ({lat}, {lng})
- Phase: globe_selection

Your role right now:
1. Greet the user warmly but concisely. Two short sentences at most — express \
genuine warmth and curiosity about where they want to go. Do not ramble or \
give a speech. Get to the point quickly while still feeling inviting.
2. Converse naturally about history, places, and eras. Be curious about what \
fascinates them. Ask their name if it comes up naturally but do not force it.
3. When the user mentions a specific place or region — for example "ancient \
Greece", "medieval Japan", "the pyramids", "Paris in the 1920s" — call the \
suggest_location tool with approximate latitude, longitude, a short name, \
and a year if a time period is implied (use negative numbers for BCE, e.g. \
-500 for 500 BCE). For "modern", "contemporary", or "today" requests, \
use 2026 (the current year). This will fly the globe camera there, drop \
a pin, and update the time slider. Then say something intriguing about the place \
in 1-2 sentences.
4. If the user is undecided, offer an unexpected suggestion. Be \
playful — maybe mention an obscure historical moment that would surprise them.
5. Do NOT generate facts, trigger world generation, or select music in this \
phase. Those come later during exploration.
6. Learn about the user: their interests, what draws them to a place or era, \
their sense of adventure. Remember these details — they will matter.
7. Keep every response to 2-4 short, punchy sentences. This is voice \
conversation, not a lecture.

When you receive a system message saying the user has confirmed exploration, \
say a heartfelt but brief goodbye. Wish them an incredible journey, \
perhaps referencing something personal you learned about them. Then call \
the summarize_session tool with your summary of the user and a rich, \
vivid description of the scene they are about to enter.

""" + TTS_RULES

# ---------------------------------------------------------------------------
# Phase 2+ — Loading: narrate while world generates
# ---------------------------------------------------------------------------
GUIDE_SYSTEM_PROMPT = """\
You are a warm, knowledgeable historical guide helping users explore any place \
and time period in human history. You speak conversationally — vivid but concise.

Current context:
- Location: {location_name} ({lat}, {lng})
- Time Period: {time_period} ({year})
- Phase: {phase} (loading | exploring)

Behavior by phase:
- loading: Narrate a rich, immersive description of the destination. Tell \
stories. Paint a picture with words. Keep talking until the world is ready. \
Call select_music to queue era-appropriate music.
- exploring: Be a tour guide. Point out features. Answer questions. Share \
facts via generate_fact. Keep responses to 2-3 sentences.

Personality: Enthusiastic but not over-the-top. Scholarly but accessible. \
Think David Attenborough meets a history professor who loves their subject.

""" + TTS_RULES

# ---------------------------------------------------------------------------
# Phase 3 — Exploring: tour guide with facts and visual context
# ---------------------------------------------------------------------------
EXPLORING_PROMPT = """\
You are a warm, knowledgeable tour guide helping a traveller explore a \
photorealistic 3D world of a historical place and time period. You speak \
conversationally — vivid but concise.

About the traveller:
{user_profile}

The world they are exploring:
{world_description}

Current context:
- Location: {location_name} ({lat}, {lng})
- Time Period: {time_period} ({year})

Your role:
1. Welcome the traveller warmly to the world. Reference something personal \
you know about them. Keep it to 2-3 sentences.
2. Your spoken response is ALWAYS the primary output — you MUST generate \
spoken text in every response. Alongside your spoken words, call generate_fact \
1-2 times per response to display supplementary fact cards on screen. Vary \
categories: culture, technology, politics, daily_life, art, science, \
architecture, food, nature, trade, religion, warfare, medicine, music, language. \
CRITICAL: Never respond with only function calls and no spoken text.
3. An image of what the user currently sees is always attached for your \
reference. Use it to RECOGNIZE and IDENTIFY landmarks, buildings, objects, \
and features (e.g. "that's the Empire State Building", "those are mangoes \
in the market"). Never physically describe what you see — no descriptions \
of colors, lighting, textures, or visual composition. Only mention \
recognized objects when relevant to conversation or when the user asks.
4. Answer questions conversationally. Be a brilliant companion, not a lecturer.
5. Keep responses to 2-3 sentences. Do not over-explain.
6. Proactively point out interesting details and tell stories about the place.

Personality: Enthusiastic but not over-the-top. Scholarly but accessible. \
Think David Attenborough meets a history professor who loves their subject.

""" + TTS_RULES


# ---------------------------------------------------------------------------
# Shared tool declarations
# ---------------------------------------------------------------------------

_SUGGEST_LOCATION = types.FunctionDeclaration(
    name="suggest_location",
    description="Suggest a specific location and time period on the globe. The frontend will fly the camera there, drop a pin, and update the time slider.",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "lat": types.Schema(type="NUMBER", description="Latitude of the location"),
            "lng": types.Schema(type="NUMBER", description="Longitude of the location"),
            "name": types.Schema(
                type="STRING",
                description="Human-readable name of the location (e.g., 'Rome, Italy')",
            ),
            "year": types.Schema(
                type="NUMBER",
                description="Year to set on the time slider. Use negative numbers for BCE (e.g., -500 for 500 BCE, -2500 for 2500 BCE). If no specific year is implied, omit this.",
            ),
        },
        required=["lat", "lng", "name"],
    ),
)

_SUMMARIZE_SESSION = types.FunctionDeclaration(
    name="summarize_session",
    description=(
        "Called when the user confirms they want to explore a location. "
        "Generate a brief goodbye, a user profile summary, and a vivid scene description "
        "for 3D world generation."
    ),
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "goodbye_text": types.Schema(
                type="STRING",
                description=(
                    "A warm, brief goodbye to the user (1-2 sentences). Reference something "
                    "personal you learned about them if possible. This text will be spoken "
                    "aloud by TTS. Example: 'What a wonderful choice! Get ready for the "
                    "sights and sounds of 1930s New York.'"
                ),
            ),
            "user_profile": types.Schema(
                type="STRING",
                description=(
                    "Summary of the user: their name (if given), interests, preferences, "
                    "personality traits observed during conversation. 2-4 sentences."
                ),
            ),
            "world_description": types.Schema(
                type="STRING",
                description=(
                    "Extremely detailed, vivid visual description of the chosen location "
                    "and time period for 3D world generation. This text is the ONLY input "
                    "to the 3D generation model, so be as specific as possible. Describe: "
                    "the exact architectural style and key structures, materials (stone, "
                    "wood, marble), the landscape and terrain, sky conditions and lighting "
                    "(time of day, weather), vegetation and natural features, the color "
                    "palette, atmospheric effects (fog, dust, golden light), people's "
                    "clothing and activities, street-level details (market stalls, carts, "
                    "signs), and sensory textures. Write as if directing a film set "
                    "designer. 8-12 detailed sentences."
                ),
            ),
        },
        required=["goodbye_text", "user_profile", "world_description"],
    ),
)


_GENERATE_LOADING_MESSAGES = types.FunctionDeclaration(
    name="generate_loading_messages",
    description=(
        "Generate 15 short, cute loading screen messages personalized to the user's "
        "interests and their chosen destination. These will be displayed one at a time "
        "during the loading animation while the 3D world generates."
    ),
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "messages": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
                description=(
                    "Array of 15 short loading messages. Each message should be a playful, "
                    "present-participle action phrase (starting with an -ing verb) that is "
                    "historically or culturally plausible for the destination. Do NOT end "
                    "with a period. Personalize to the user's interests when possible. "
                    "Examples: 'Preparing letters from Napoleon's correspondence', "
                    "'Checking out the latest prints from the Renaissance', "
                    "'Packing your favorite astronomy books for the journey'"
                ),
            ),
        },
        required=["messages"],
    ),
)

_SELECT_MUSIC = types.FunctionDeclaration(
    name="select_music",
    description="Select background music that fits the era, region, and mood",
    parameters=types.Schema(
        type="OBJECT",
        properties={
            "era": types.Schema(type="STRING", description="Historical era"),
            "region": types.Schema(type="STRING", description="Geographic region"),
            "mood": types.Schema(
                type="STRING",
                description="Mood of the music",
                enum=["contemplative", "majestic", "adventurous", "peaceful", "dramatic"],
            ),
            "song_suggestions": types.Schema(
                type="ARRAY",
                items=types.Schema(type="STRING"),
                description=(
                    "A list of 7 real song names (with artist) to search for on a music "
                    "streaming service. Pick songs that genuinely fit the era, region, and "
                    "mood — any genre, any era, famous or obscure. Include a mix of well-known "
                    "and niche tracks to maximise search hits. Format each entry as "
                    "'Song Title - Artist'. Examples: 'Clair de Lune - Debussy', "
                    "'Take Five - Dave Brubeck', 'Sakura - Traditional Japanese'. "
                    "The system needs TWO songs (loading + exploring), so variety matters."
                ),
            ),
        },
        required=["era", "region", "mood", "song_suggestions"],
    ),
)


def _build_phase1_tools() -> list[types.FunctionDeclaration]:
    """Phase 1 (globe selection): suggest locations + summarize on exit."""
    return [_SUGGEST_LOCATION, _SUMMARIZE_SESSION]


def _build_transition_tools() -> list[types.FunctionDeclaration]:
    """Transition phase (confirm exploration): goodbye + summary + loading messages + music."""
    return [_SUMMARIZE_SESSION, _GENERATE_LOADING_MESSAGES, _SELECT_MUSIC]


def _build_exploration_tools() -> list[types.FunctionDeclaration]:
    """Phase 2+ (loading/exploring): full tool set."""
    return [
        types.FunctionDeclaration(
            name="trigger_world_generation",
            description="Trigger 3D world generation when the user wants to explore a location/era",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "location": types.Schema(type="STRING", description="The place to generate"),
                    "time_period": types.Schema(type="STRING", description="The historical era"),
                    "scene_description": types.Schema(
                        type="STRING",
                        description="Vivid description of the scene to generate for World Labs",
                    ),
                },
                required=["location", "time_period", "scene_description"],
            ),
        ),
        _SELECT_MUSIC,
        types.FunctionDeclaration(
            name="generate_fact",
            description="Generate a historical fact to display as an overlay card",
            parameters=types.Schema(
                type="OBJECT",
                properties={
                    "fact_text": types.Schema(
                        type="STRING",
                        description="A concise, interesting historical fact (1-2 sentences)",
                    ),
                    "category": types.Schema(
                        type="STRING",
                        description="Category of the fact",
                        enum=["culture", "technology", "politics", "daily_life", "art", "science", "architecture", "food", "nature", "trade", "religion", "warfare", "medicine", "music", "language"],
                    ),
                },
                required=["fact_text", "category"],
            ),
        ),
        _SUGGEST_LOCATION,
    ]


class GeminiGuide:
    """Stateful conversation engine wrapping Gemini 2.5 Flash."""

    def __init__(self, api_key: str):
        self.client = genai.Client(api_key=api_key)
        self.conversation_history: list[types.Content] = []
        self.context: dict = {
            "location_name": "Not selected",
            "lat": "",
            "lng": "",
            "time_period": "Not selected",
            "year": "",
            "phase": "globe_selection",
            "user_profile": "",
            "world_description": "",
        }

    def update_context(self, **kwargs) -> None:
        """Update guide context (location, time_period, phase, etc.)."""
        self.context.update(kwargs)

    def _build_config(self) -> types.GenerateContentConfig:
        phase = self.context.get("phase", "globe_selection")
        if phase == "transition":
            # Transition: keep Phase 1 prompt for conversation context continuity
            prompt = PHASE1_GLOBE_PROMPT.format(**self.context)
            tools = _build_transition_tools()
        elif phase == "globe_selection":
            prompt = PHASE1_GLOBE_PROMPT.format(**self.context)
            tools = _build_phase1_tools()
        elif phase == "exploring":
            prompt = EXPLORING_PROMPT.format(**self.context)
            tools = _build_exploration_tools()
        else:
            prompt = GUIDE_SYSTEM_PROMPT.format(**self.context)
            tools = _build_exploration_tools()

        # During transition, force Gemini to call tools (summarize_session,
        # generate_loading_messages, select_music) rather than just speaking.
        tool_config = None
        if phase == "transition":
            tool_config = types.ToolConfig(
                function_calling_config=types.FunctionCallingConfig(mode="ANY")
            )

        return types.GenerateContentConfig(
            system_instruction=prompt,
            tools=[types.Tool(function_declarations=tools)],
            tool_config=tool_config,
        )

    async def generate_response(
        self, user_text: str | None = None, image_part: types.Part | None = None
    ) -> AsyncGenerator[dict, None]:
        """Stream a response from Gemini. Yields dicts:
          {"type": "text", "text": "..."}
          {"type": "function_call", "name": "...", "args": {...}}

        If user_text is None, continues from the current history
        (used after function call results are added).
        If image_part is provided, it is included alongside the user text
        for visual context (exploring phase canvas frame).
        """
        if user_text is not None:
            logger.info("generate_response: user_text=%r", user_text[:80] if len(user_text) > 80 else user_text)
            parts = [types.Part(text=user_text)]
            if image_part:
                parts.append(image_part)
                logger.info("generate_response: including image part for visual context")
            self.conversation_history.append(
                types.Content(role="user", parts=parts)
            )
        elif image_part:
            # Image-only continuation (e.g. auto-narrate with visual context)
            logger.info("generate_response: continuation with image part")
            self.conversation_history.append(
                types.Content(role="user", parts=[image_part])
            )
        else:
            logger.info("generate_response: continuation (no new user message)")

        logger.debug("History: %d entries", len(self.conversation_history))

        config = self._build_config()
        logger.info("Calling gemini-2.5-flash with %d messages", len(self.conversation_history))

        response = await self.client.aio.models.generate_content_stream(
            model="gemini-2.5-flash",
            contents=self.conversation_history,
            config=config,
        )

        full_text = ""
        function_calls = []

        async for chunk in response:
            if not chunk.candidates or not chunk.candidates[0].content:
                continue
            for part in chunk.candidates[0].content.parts:
                if part.function_call:
                    fc = {
                        "type": "function_call",
                        "name": part.function_call.name,
                        "args": dict(part.function_call.args) if part.function_call.args else {},
                    }
                    function_calls.append(fc)
                    yield fc
                elif part.text:
                    full_text += part.text
                    yield {"type": "text", "text": part.text}

        logger.info("Stream done. %d text chars, %d function calls", len(full_text), len(function_calls))

        # Record model response in history (include both text and function calls)
        parts = []
        if full_text:
            parts.append(types.Part(text=full_text))
        for fc in function_calls:
            parts.append(types.Part(function_call=types.FunctionCall(
                name=fc["name"],
                args=fc["args"],
            )))
        self.conversation_history.append(
            types.Content(role="model", parts=parts)
        )
        logger.debug("History now: %d entries", len(self.conversation_history))

    def add_function_result(self, name: str, result: dict) -> None:
        """Add function execution result to conversation history."""
        self.conversation_history.append(
            types.Content(
                role="user",
                parts=[
                    types.Part(
                        function_response=types.FunctionResponse(
                            name=name, response=result
                        )
                    )
                ],
            )
        )

    def reset(self) -> None:
        """Clear conversation history for a fresh session."""
        self.conversation_history.clear()
