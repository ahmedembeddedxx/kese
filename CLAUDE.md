# CLAUDE.md
_Last updated: 2026-10-03 - initial scaffold session_

## Architecture Overview

Mend is a mobile-first PWA that turns a phone camera into a guided repair
assistant for household electrical, AC and car problems (plus a general
"point at anything" mode), narrated live in Urdu or English.

The browser talks to two different backends directly, by design, so the
"feels instant" parts never touch our server:

1. **Gemini Live, direct from the browser** (`apps/web`). The browser opens
   a WebSocket straight to Gemini Live using a short-lived ephemeral token
   minted by our API. Mic audio (16 kHz PCM) and one camera JPEG/second
   stream up; 24 kHz PCM audio streams back. The real Gemini API key never
   reaches the phone. The Live session calls tools
   (`highlight`, `mark_wire`, `clear_highlights`, `advance_step`,
   `safety_gate`, `lookup_kb`, `save_device`) that are executed in the
   browser or routed to our API.
2. **Our FastAPI backend** (`services/api`), used only for small, stateless
   JSON calls: minting the ephemeral token, part/box detection
   (`/detect`), wire/part segmentation fallback (`/segment`), knowledge-base
   search (`/kb/search`), saved devices (`/devices`), and session event
   logs (`/events`). It never sees or stores raw audio/video - only JPEG
   crops for detection and coordinates back out.

On-device tracking (`apps/web/src/features/tracking`) keeps boxes glued to
parts between detections using Lucas-Kanade optical flow on a small
greyscale frame, so the UI feels instant even though `/detect` round-trips
over the network every 1-2 seconds.

The **knowledge base** (`pipelines/kb`) is a separately-run crawl → extract
→ structure → clean → embed pipeline that builds a Pakistan-specific
library of manuals, fault tables and procedures. It is the long-term moat;
the API only *reads* the indexed result via `/kb/search`.

**Playbooks** (`playbooks/`) are reviewed, versioned JSON scripts (one per
repair task) that the Live agent follows step by step instead of
improvising. Every risky step is gated behind an on-screen confirmation
(`playbooks/gates.json`), and playbooks validate against
`playbooks/schema.json`.

## File & Directory Map

| Path | Purpose | Notes |
|---|---|---|
| `apps/web/` | React + TypeScript PWA | Vite, Tailwind v4, Zustand, `@google/genai`. `src/features/live/` (`useLiveSession.ts` orchestrates camera/mic/WS, `geminiLiveClient.ts` wraps the SDK, `toolHandlers.ts` is the pure, unit-tested tool-call dispatcher), `src/features/overlay/` (`OverlayCanvas.tsx` + `geometry.ts` pure coordinate math), `src/features/tracking/` (optical-flow tracking, not yet implemented -- see Architecture Change Log), `src/features/ui/` (Home/Live/Done screens), `src/lib/` (`apiClient.ts`, `auth.ts` dev-token bypass mirroring D-006, `camera.ts` frame capture, `audio/` PCM worklet + player), `src/store/` (`sessionStore.ts`, `overlayStore.ts`, both Zustand) |
| `services/api/` | FastAPI backend | `app/routers/*` one file per endpoint group, `app/services/*` Gemini/Replicate/Firestore clients, `app/models.py` Pydantic schemas, `app/config.py` central model IDs/prices (D-005), `app/auth.py` Firebase + dev-mode auth (D-006), `app/playbooks.py` schema-validated playbook loader, `app/live_tools.py` Live tool declarations + system prompt builder |
| `pipelines/kb/` | Knowledge-base crawl pipeline | `kb_pipeline/` package: `schema.py` (SourceConfig/KBDocument/KBChunk), `registry.py`, `extract.py` (HTML/PDF, real), `structure.py` (real heuristics), `clean.py` (MinHash dedup, real), `embed.py` (chunking + Firestore write, real; embedder injected), `crawl.py` (crawl4ai wrapper, not yet installed/exercised -- see `README.md`). `sources/*.yaml` is the source registry (`*.example.yaml` = templates only, see `sources/README.md`) |
| `playbooks/schema.json` | JSON Schema every playbook must validate against | id, category, risk, steps, stop_if, sources, review |
| `playbooks/gates.json` | Shared catalogue of safety gates (bilingual prompts) | referenced by `gate` field in playbook steps, served to the frontend via `GET /gates` |
| `playbooks/electrical/`, `playbooks/ac/`, `playbooks/car/` | One JSON file per repair task | filename = playbook id. Full breadth list from the plan: 8 electrical + 8 AC + 10 car = 26 playbooks, all self-authored and schema-validated, none yet human-safety-reviewed (`review.safety_reviewed: false` on every one -- needs real-hardware testing before that flips, per the plan's own gate) |
| `evals/` | Labelled frames/videos for detection accuracy tracking | not yet populated - needs real hardware footage |
| `infra/` | Dockerfiles, `docker-compose.yml`, deploy configs | local-first: `docker compose up` runs the whole stack. `firestore.rules` is the Firestore security rules file (D-006/D-008 context); `Dockerfile.firestore-emulator` pre-downloads the emulator JAR at build time so it needs no network to start; `.docker/ca-bundle.crt` (gitignored, see repo-root `.gitignore` and D-008) is an optional, dev-sandbox-only TLS trust anchor for `pip`/`npm` during image builds, never used at runtime |
| `.github/workflows/` | CI | runs the same Docker Compose build/test as local |
| `scripts/` | One-off dev scripts | |
| `CLAUDE.md` | This file - architecture and file map | |
| `AGENTS.md` | Rules for coding agents working in this repo | |
| `decisions.md` | Append-only decision log (D-001, D-002, ...) | |
| `handover.md` | Ephemeral: what's happening right now | overwritten every session |

## Quick Lookup ("where is...")

- Ephemeral Gemini token minting → `services/api/app/routers/session.py`
- Detection endpoint (boxes/polygons) → `services/api/app/routers/detect.py`
- Segmentation fallback (wires) → `services/api/app/routers/segment.py`
- KB vector search → `services/api/app/routers/kb.py`
- Saved devices → `services/api/app/routers/devices.py`
- Playbook data (for the frontend's step-progress UI) → `services/api/app/routers/playbooks.py`
- Safety gate catalogue (bilingual, single source of truth) → `services/api/app/routers/gates.py`, fetched by the frontend instead of duplicated
- Session event logs → `services/api/app/routers/events.py`
- Gemini/Replicate/Firestore clients → `services/api/app/services/`
- Auth (Firebase + dev-mode bypass) → `services/api/app/auth.py`
- Per-user rate limiting → `services/api/app/rate_limit.py`
- Model IDs, prices, quotas (single source of truth) → `services/api/app/config.py`
- Live WebSocket session orchestration (camera/mic, not yet live-tested) → `apps/web/src/features/live/useLiveSession.ts`
- Gemini Live SDK wrapper (not yet live-tested) → `apps/web/src/features/live/geminiLiveClient.ts`
- Tool-call dispatcher (pure, unit-tested) → `apps/web/src/features/live/toolHandlers.ts`
- Canvas overlay (boxes, wire outlines, labels) → `apps/web/src/features/overlay/OverlayCanvas.tsx`, coordinate math in `geometry.ts`
- Optical-flow box tracking → `apps/web/src/features/tracking/` (not yet implemented)
- Home / Live repair / Done screens → `apps/web/src/features/ui/`
- API client (frontend) → `apps/web/src/lib/apiClient.ts`
- Frame capture for `/detect` → `apps/web/src/lib/camera.ts`
- Mic capture (AudioWorklet) / playback → `apps/web/src/lib/audio/`
- Playbook schema / gates → `playbooks/schema.json`, `playbooks/gates.json`
- KB source registry → `pipelines/kb/sources/*.yaml` (see `sources/README.md` before adding a real one)
- KB extract/structure/clean/embed (real, tested) → `pipelines/kb/kb_pipeline/`
- KB crawl (not yet installed/exercised) → `pipelines/kb/kb_pipeline/crawl.py`
- Docker Compose local stack → `infra/docker-compose.yml`
- CI → `.github/workflows/ci.yml`

## Architecture Change Log

| Date | Change | Related Decision |
|---|---|---|
| 2026-10-03 | Initial repo scaffold: directory layout, playbook schema, gate catalogue | D-001 |
| 2026-10-03 | FastAPI backend built out: all 7 routers (`session`, `detect`, `segment`, `kb`, `devices`, `events`, `playbooks`, `gates`), auth, rate limiting, Firestore-backed stores, 49 pytest tests, Docker-verified against the real Firestore emulator | D-002, D-005, D-006 |
| 2026-10-03 | React PWA scaffolded: Home/Live/Done screens, overlay canvas, Zustand stores, tool-call dispatcher, camera/audio pipeline wired (not yet live-tested), 29 Vitest tests, production build verified | D-009 |
| 2026-10-03 | Docker Compose local stack: API + Firestore emulator (JAR pre-downloaded at build time, no network needed to start), then web + web-test + kb-pipeline-test added | D-004, D-008 |
| 2026-10-03 | All 26 breadth-list playbooks authored (8 electrical, 8 AC, 10 car), schema-validated; KB pipeline skeleton built (extract/structure/clean/embed real and tested, crawl deferred) | D-010 |

## Conventions

- **Language**: Python 3.12 (backend, pipeline), TypeScript (frontend).
- **No API keys ever reach the browser.** The frontend only ever holds a
  short-lived ephemeral token for Gemini Live.
- **The backend is stateless and never logs raw frames or audio** - only
  JSON coordinates, metadata and timings.
- **Every endpoint validates its request body with Pydantic** and is
  rate-limited per user (`/detect`, `/session` especially).
- **Playbooks are data, not code.** The agent follows them; it does not
  improvise safety-relevant steps. Every playbook step needing a gate
  references a shared gate id from `playbooks/gates.json`.
- **Model IDs and prices live in one config file**
  (`services/api/app/config.py`), never hardcoded inline, because they
  change (see Risks table in the technical plan).
- **No em dashes** in code comments, UI copy or docs.
- **Commits are split by type** (`feat:`, `test:`, `docs:`, `chore:`), each
  touching only its own files. See `decisions.md` D-003 for the
  attribution convention used on every commit.
- **Docker Compose first.** The full stack and its tests run locally in
  Docker before anything is pushed (see `decisions.md` D-004 for why the
  Docker Hub mirror is used for base images).
