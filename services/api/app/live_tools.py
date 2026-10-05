"""Tool declarations and system prompt for a Gemini Live session.

These are sent to `/session`, which embeds them into the ephemeral
token's Live config, per the technical plan's "Session setup carries the
system prompt, the active playbook and the tool declarations" line.
"""

from __future__ import annotations

TOOL_DECLARATIONS: list[dict] = [
    {
        "name": "highlight",
        "description": "Box or outline named parts on the live video for the user to see.",
        "parameters": {
            "type": "object",
            "properties": {
                "targets": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Part names to box, e.g. ['fan capacitor', 'capacitor wires'].",
                },
                "style": {"type": "string", "description": "Optional highlight style hint."},
            },
            "required": ["targets"],
        },
    },
    {
        "name": "mark_wire",
        "description": (
            "Ask the user to tap a wire on screen so it can be segmented, "
            "named and tracked."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "hint": {
                    "type": "string",
                    "description": "What to tell the user, e.g. which wire to tap.",
                },
            },
            "required": ["hint"],
        },
    },
    {
        "name": "clear_highlights",
        "description": "Remove all overlays from the screen, e.g. when the step changes.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "advance_step",
        "description": "Move the active playbook forward to a specific step id.",
        "parameters": {
            "type": "object",
            "properties": {"step_id": {"type": "string"}},
            "required": ["step_id"],
        },
    },
    {
        "name": "safety_gate",
        "description": (
            "Block progress until the user confirms a safety check on "
            "screen (e.g. power off)."
        ),
        "parameters": {
            "type": "object",
            "properties": {"check_id": {"type": "string"}},
            "required": ["check_id"],
        },
    },
    {
        "name": "lookup_kb",
        "description": "Search the knowledge base for a fault, error code or procedure.",
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "category": {"type": "string", "enum": ["electrical", "ac", "car", "general"]},
            },
            "required": ["query"],
        },
    },
    {
        "name": "save_device",
        "description": "Remember the user's fan, AC model or car for next time.",
        "parameters": {
            "type": "object",
            "properties": {
                "kind": {"type": "string"},
                "details": {"type": "object"},
            },
            "required": ["kind"],
        },
    },
]

TOOL_NAMES: list[str] = [tool["name"] for tool in TOOL_DECLARATIONS]

_HARD_REFUSAL_RULES = (
    "Never give step-by-step instructions for: gas line work, refrigerant "
    "handling or compressor work, anything inside a main distribution "
    "board or meter, airbags, fuel line repair, brake hydraulics repair, "
    "or hybrid/EV high-voltage systems. If asked, explain briefly why and "
    "say to call a licensed professional."
)

_SAFETY_RULES = (
    "Safety gates (power off, capacitor discharged, engine off and cool, "
    "handbrake on, etc.) require the user to tap a confirmation on screen, "
    "never just a spoken yes. If you see or the user reports burn marks, "
    "smoke, a smell of burning, sparks, or a fuel/coolant leak under "
    "pressure, stop the playbook immediately and tell them to stop and "
    "call a professional."
)


_URDU_BREVITY_LINE = (
    "Reply in Urdu, written in Urdu script, and keep every reply brief: one "
    "or two short sentences at a time."
)

_TTS_FRIENDLY_LINE = (
    "Your replies are read aloud by a text-to-speech engine: write short "
    "plain sentences, no markdown, no lists, no emojis, no URLs, spell out "
    "numbers, and never describe screen coordinates."
)

_UI_LINE = (
    "The user can see boxes drawn on their live camera view when you call "
    "highlight. The user speaks to you; there are no on-screen Repeat or "
    "I'm stuck buttons, so invite them to just say it if they need a step "
    "repeated or are stuck."
)


def build_live_config(*, voice_provider: str, language: str) -> dict:
    """The camelCase Live connect config the browser spreads into
    `ai.live.connect({config: {...live_config, tools}})`.

    The same dict is converted to snake_case and locked into the ephemeral
    token (see `GeminiClient.mint_ephemeral_token`), so client and server
    cannot disagree. Session resumption and context window compression are
    mandatory from day 1: audio+video Live sessions otherwise end after
    about 2 minutes. Not exercised against a live Gemini key.
    """
    text_mode = voice_provider == "elevenlabs"
    config: dict = {
        "responseModalities": ["TEXT"] if text_mode else ["AUDIO"],
        "inputAudioTranscription": {},
        "outputAudioTranscription": {},
        "sessionResumption": {},
        "contextWindowCompression": {"slidingWindow": {}},
    }
    if not text_mode:
        # No audio goes to Gemini in TEXT mode (ElevenLabs does the ears),
        # so voice activity detection and the speech voice only apply here.
        config["realtimeInputConfig"] = {"automaticActivityDetection": {"silenceDurationMs": 700}}
        config["speechConfig"] = {"languageCode": "ur-PK" if language == "ur" else "en-US"}
    return config


def build_system_prompt(
    *,
    category: str,
    playbook: dict | None,
    language: str,
    voice_provider: str = "gemini",
) -> str:
    language_line = (
        "Speak and write to the user in Urdu by default, switching to "
        "English only if they speak English to you. " + _URDU_BREVITY_LINE
        if language == "ur"
        else "Speak and write to the user in English by default, switching "
        "to Urdu only if they speak Urdu to you."
    )

    if playbook is not None:
        steps_summary = "; ".join(f"{s['id']}: {s['say']}" for s in playbook["steps"])
        task_line = (
            f"You are guiding the user through the playbook '{playbook['title']}' "
            f"({playbook['id']}). Follow its steps in order, do not improvise safety "
            f"steps, and use advance_step to move between them. Steps: {steps_summary}."
        )
    else:
        task_line = (
            f"No specific playbook is loaded for category '{category}'. Search the "
            "knowledge base with lookup_kb, explain what you see, highlight the "
            "relevant parts, and clearly say when the job needs a professional."
        )

    voice_line = _TTS_FRIENDLY_LINE + " " if voice_provider == "elevenlabs" else ""

    return (
        "You are Mend, a calm, encouraging repair assistant that talks a "
        "non-technician through a safe, simple fix using their phone "
        "camera. " + language_line + " " + voice_line + _UI_LINE + " " + task_line + " "
        + _SAFETY_RULES + " " + _HARD_REFUSAL_RULES
    )
