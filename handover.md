# handover.md
_Overwritten every turn. If you're reading this at session start, this is the state you're resuming from._

## Current Task
UI rebuild "match Gemini" plus ElevenLabs Urdu voice is merged (PR #2).
Focus is now UI polish. A keyless clickable demo was published as a
Claude artifact for design review (build: `node apps/web/scripts/build-demo.mjs`).

## Just Done
- Latest (D-015): UI is English only, nicer fonts, voice auto-detects English + Urdu, settings sheet (engine, voice, speech model, vision model) backed by `GET /options` and allow-listed `/session` fields; 147 API + 193 web tests.
- Backend: ElevenLabs single-use tokens (`/voice/token`, `voice` block in
  `/session`), server-side fallback to Gemini audio, mandatory consent,
  Live config (TEXT/AUDIO, resumption, compression, multi-use token),
  `MEND_DEV_FAKES` keyless mode. 103 pytest pass in Docker.
- Web: full-screen camera Live screen (flip, screen share, torch, voice
  pill, mic, end, captions, steps panel, safety gate with "Not yet"),
  Consent, Home with category doors, repair sheet, Done with feedback and
  save-device. Urdu default, Nastaliq/Naskh fonts, light/dark, reduced
  motion/transparency fallbacks. Repeat and "I'm stuck" removed. 187
  Vitest pass in Docker, web image builds, KB 32 pass.
- Fixed real bugs found on the way: overlay ignored `object-fit: cover`
  and mirroring; mic worklet sent native-rate audio to a 16 kHz API; the
  wire-tap request (`mark_wire`) had no UI.
- apple-design skill wired in by reference (`scripts/install-skills.sh`,
  D-012). Decisions D-012 to D-014 logged.

## Next Step
PR the English-only UI + settings work (branch `claude/dazzling-mendel-wzr1ar`), then collect Ahmed's feedback and iterate. Then, with real keys:
1. Put `MEND_ELEVENLABS_API_KEY`, `MEND_ELEVENLABS_VOICE_ID` (an Urdu
   voice), `MEND_GEMINI_API_KEY`, `MEND_REPLICATE_API_TOKEN` in
   `services/api/.env`, run the stack, test on a real phone.
2. Verify the unverified bits listed in D-013 (tts token type, pcm_24000,
   TEXT mode with transcription, resumption) and tune barge-in/echo.

## Open Questions / Blockers
- Needs from Ahmed: ElevenLabs API key + chosen Urdu voice id, Gemini key
  (paid tier if privacy matters), Replicate token, Firebase project id.
- Screenshots were taken with Chromium's fake camera only; a real-phone
  visual pass is still owed. Playbooks are still not human-safety-reviewed.

## Files Touched This Turn
- services/api: config, models, live_tools, dependencies, main, routers
  (session, voice), services (elevenlabs_client, fake_clients,
  gemini_client), tests
- apps/web/src: index.css, i18n/, store/ (session, live), lib/ (types,
  apiClient, cameraController, voice/, audio/pcmPlayer), features/live/,
  features/overlay/, features/ui/, components/, App.tsx, index.html
- scripts/install-skills.sh, .gitignore, AGENTS.md, CLAUDE.md,
  decisions.md, handover.md
