# handover.md
_Overwritten every turn. If you're reading this at session start, this is the state you're resuming from._

## Current Task
Building the full Mend monorepo from `Mend_Technical_Plan.pdf` while Ahmed
sleeps: repo scaffold, FastAPI backend, React PWA, KB pipeline skeleton,
playbooks, Docker Compose, CI. Testing everything in Docker before any
push. Working alone in the background, no deploys, no merges.

## Just Done
- Repo scaffold created: `apps/web`, `services/api`, `pipelines/kb`,
  `playbooks/{electrical,ac,car}`, `evals`, `infra`, `scripts`,
  `.github/workflows`.
- `playbooks/schema.json` (JSON Schema for every playbook) and
  `playbooks/gates.json` (shared bilingual safety-gate catalogue) written
  and pushed.
- `CLAUDE.md`, `AGENTS.md`, `decisions.md` written (this file next).
- Git identity fixed to the real GitHub account `ahmedembeddedxx`
  (previous commit had been authored as the literal string "Ahmed";
  amended + force-pushed with `--force-with-lease`, safe since it was the
  only commit on a fresh branch).
- Confirmed Docker daemon works in this container (`dockerd` started
  manually) and `mirror.gcr.io/library/python:3.12-slim` and
  `mirror.gcr.io/library/node:22-slim` pull fine (see D-004 — Docker Hub
  direct pulls are 429 rate-limited here).

## Next Step
Commit the docs (`docs:` type, this file + CLAUDE.md + AGENTS.md +
decisions.md) with the Ibtehaj778 co-author trailer, push, then start on
the FastAPI backend skeleton (`services/api`): config.py with centralized
model IDs/prices (D-005), Pydantic models, `/session` ephemeral-token
endpoint, `/detect`, `/segment`, `/kb/search`, `/devices`, `/events`
routers, with pytest tests and mocked Gemini/Replicate clients (no real
API keys available yet). Then the React PWA scaffold, then the KB pipeline
skeleton, then playbooks for the hackathon breadth list, then Docker
Compose + CI, then a full local Docker test run before any further push.

## Open Questions / Blockers (for Ahmed, when awake)
- **API keys needed before live Gemini/Replicate calls can be tested for
  real:** a Gemini API key (AI Studio, free tier is fine for dev) and,
  later, a Replicate API token for the SAM segmentation fallback. Until
  then, all Gemini/Replicate calls in tests are mocked and the real
  client code is written against the documented API shapes but unverified
  against live responses.
- **Firebase/GCP project**: no GCP project ID or Firebase config supplied
  yet, so Firestore/Cloud Storage/Secret Manager integration is being
  built against the local Firestore emulator only; nothing will be
  deployed per your instruction.
- **Hackathon date** is still open per the plan itself ("Open questions"
  page 21) — doesn't block build work, only the final timeline/demo-day
  polish phase.
- **Which fan/AC/car models the team can test on** before the event (plan's
  own open question) — doesn't block playbook authoring, since playbooks
  are written generically per the breadth table and will need real-hardware
  validation later per the plan's "tested on real hardware" gate.
- Everything else in the plan is being built as specified; nothing else is
  blocking.

## Files Touched This Turn
- `playbooks/schema.json` — new, playbook JSON Schema
- `playbooks/gates.json` — new, safety gate catalogue
- `CLAUDE.md` — new, architecture/file map
- `AGENTS.md` — new, agent rules
- `decisions.md` — new, D-001 through D-005
- `handover.md` — new (this file)
