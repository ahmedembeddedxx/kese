# CLAUDE.md
_Last updated: 2026-10-03 — initial scaffold session_

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
   logs (`/events`). It never sees or stores raw audio/video — only JPEG
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
| `apps/web/` | React + TypeScript PWA | Vite, Tailwind, Zustand. `src/features/live` (Gemini Live session), `src/features/overlay` (canvas boxes), `src/features/tracking` (optical flow), `src/features/ui` (Home/Live/Done screens) |
| `services/api/` | FastAPI backend | `app/routers/*` one file per endpoint group, `app/services/*` Gemini/Replicate clients, `app/models.py` Pydantic schemas, `app/config.py` central model IDs/prices (see D-002 decision) |
| `pipelines/kb/` | Knowledge-base crawl pipeline | `sources/*.yaml` source registry, `crawl.py`, `extract.py`, `structure.py`, `clean.py`, `embed.py`, run as a one-shot script or Cloud Run Job |
| `playbooks/schema.json` | JSON Schema every playbook must validate against | id, category, risk, steps, stop_if, sources, review |
| `playbooks/gates.json` | Shared catalogue of safety gates (bilingual prompts) | referenced by `gate` field in playbook steps |
| `playbooks/electrical/`, `playbooks/ac/`, `playbooks/car/` | One JSON file per repair task | filename = playbook id |
| `evals/` | Labelled frames/videos for detection accuracy tracking | not yet populated — needs real hardware footage |
| `infra/` | Dockerfiles, `docker-compose.yml`, deploy configs | local-first: `docker compose up` runs the whole stack |
| `.github/workflows/` | CI | runs the same Docker Compose build/test as local |
| `scripts/` | One-off dev scripts | |
| `CLAUDE.md` | This file — architecture and file map | |
| `AGENTS.md` | Rules for coding agents working in this repo | |
| `decisions.md` | Append-only decision log (D-001, D-002, ...) | |
| `handover.md` | Ephemeral: what's happening right now | overwritten every session |

## Quick Lookup ("where is...")

- Ephemeral Gemini token minting → `services/api/app/routers/session.py`
- Detection endpoint (boxes/polygons) → `services/api/app/routers/detect.py`
- Segmentation fallback (wires) → `services/api/app/routers/segment.py`
- KB vector search → `services/api/app/routers/kb.py`
- Saved devices → `services/api/app/routers/devices.py`
- Session event logs → `services/api/app/routers/events.py`
- Gemini/Replicate API clients → `services/api/app/services/`
- Model IDs, prices, quotas (single source of truth) → `services/api/app/config.py`
- Live WebSocket session + tool handlers (browser side) → `apps/web/src/features/live/`
- Canvas overlay (boxes, wire outlines, labels) → `apps/web/src/features/overlay/`
- Optical-flow box tracking → `apps/web/src/features/tracking/`
- Home / Live repair / Done screens → `apps/web/src/features/ui/`
- Playbook schema / gates → `playbooks/schema.json`, `playbooks/gates.json`
- Crawl source registry → `pipelines/kb/sources/*.yaml`
- Docker Compose local stack → `infra/docker-compose.yml`
- CI → `.github/workflows/ci.yml`

## Architecture Change Log

| Date | Change | Related Decision |
|---|---|---|
| 2026-10-03 | Initial repo scaffold: directory layout, playbook schema, gate catalogue | D-001 |

## Conventions

- **Language**: Python 3.12 (backend, pipeline), TypeScript (frontend).
- **No API keys ever reach the browser.** The frontend only ever holds a
  short-lived ephemeral token for Gemini Live.
- **The backend is stateless and never logs raw frames or audio** — only
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
