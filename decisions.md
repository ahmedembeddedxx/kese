# decisions.md

## D-001 — Adopt the technical plan's architecture and tech stack as-is
- **Date:** 2026-10-03
- **Context:** `Mend_Technical_Plan.pdf` (Oct 3, 2026, @Ahmed) lays out the
  full system: browser-direct Gemini Live for voice/video, a thin stateless
  FastAPI backend for detection/KB/devices, on-device optical-flow
  tracking, a crawl-based knowledge base, JSON playbooks with safety gates,
  and a GCP free-tier deployment.
- **Decision:** Build exactly this architecture: React/Vite/TS/Tailwind/
  Zustand PWA, FastAPI + Pydantic backend, Firestore + Cloud Storage,
  Crawl4AI/trafilatura/PyMuPDF pipeline, Docker Compose locally with
  GitHub Actions CI mirroring it.
- **Rationale:** The plan already did the feasibility analysis (Gemini Live
  language support, box/segmentation APIs, latency budget, cost estimate)
  and picked a stack that is "Go" or "Go with fallback" on every
  component. No reason to re-litigate it before building.
- **Alternatives considered:** None evaluated independently; the plan itself
  is the source of truth for this decision.
- **Approved by:** Ahmed (plan author, self-approved — within existing
  mandate).
- **Status:** Active.

## D-002 — Backend runs on Python 3.12, not the system default 3.11
- **Date:** 2026-10-03
- **Context:** The plan specifies "Python 3.12, FastAPI, Pydantic,
  `google-genai`, `replicate` client." The container's system `python3` is
  3.11.15; 3.12.3 is available via `/usr/bin/python3.12` and via `uv`.
- **Decision:** `services/api` targets Python 3.12 explicitly (Dockerfile
  base image `python:3.12-slim`, local venv created with
  `python3.12 -m venv` or `uv venv --python 3.12`).
- **Rationale:** Matches the plan exactly and avoids 3.11-vs-3.12 behaviour
  drift between local dev and the Cloud Run deploy target.
- **Alternatives considered:** Using system 3.11 (rejected: plan explicitly
  says 3.12, and Cloud Run image should match local/dev exactly to honor
  the "Docker first" rule in AGENTS.md).
- **Approved by:** Self-approved (low-risk, matches plan spec exactly).
- **Status:** Active.

## D-003 — Commit and PR attribution convention
- **Date:** 2026-10-03
- **Context:** The team's working convention: commits authored by the
  human developer's real GitHub identity, with the collaborator credited
  as co-author. No AI attribution lines in commits or PRs on this repo.
- **Decision:** Git `user.name`/`user.email` in this checkout are set to
  the repo owner's real GitHub identity (`ahmedembeddedxx`,
  `175879344+ahmedembeddedxx@users.noreply.github.com`). Every commit
  carries a `Co-authored-by: Ibtehaj778
  <144600896+Ibtehaj778@users.noreply.github.com>` trailer. No
  `Co-Authored-By: Claude...` or `Claude-Session:` lines are added to
  commits or PR bodies on this repo, per explicit instruction overriding
  the harness's default attribution.
- **Rationale:** Explicit, repeated instruction from the repo owner during
  this session.
- **Alternatives considered:** Default harness attribution (rejected per
  explicit user instruction, which takes precedence).
- **Approved by:** Ahmed (repo owner, explicit instruction).
- **Status:** Active.

## D-004 — Pull Docker base images through the Google Docker Hub mirror
- **Date:** 2026-10-03
- **Context:** `docker pull python:3.12-slim` / `node:22-slim` directly
  from `docker.io` returned `429 Too Many Requests` (Docker Hub anonymous
  pull rate limiting in this environment).
- **Decision:** Pull base images via `mirror.gcr.io/library/<image>`
  instead of `docker.io/library/<image>` in all Dockerfiles used for local
  dev. CI may need the same mirror or a Docker Hub login, revisit if CI
  hits the same limit.
- **Rationale:** `mirror.gcr.io` pulls succeeded immediately for both
  `python:3.12-slim` and `node:22-slim`; it is a drop-in cache of Docker
  Hub's official images with no auth required.
- **Alternatives considered:** Docker Hub login (needs credentials we
  don't have); waiting out the rate limit (unacceptable, blocks all local
  Docker-first testing).
- **Approved by:** Self-approved (low-risk, reversible, unblocks required
  "Docker first" workflow).
- **Status:** Active.

## D-005 — Centralize all Gemini/Replicate model IDs and prices
- **Date:** 2026-10-03
- **Context:** The plan's own risk table flags "Model names, prices or
  limits change" (medium likelihood, "broken calls, cost surprise") and
  recommends keeping "Model IDs and prices in one config file."
- **Decision:** `services/api/app/config.py` is the single source of truth
  for every model ID (`gemini-3.8-live`, `gemini-3.1-flash-lite`, the
  embedding model, the Replicate SAM model) and every price used in cost
  estimates/budget checks. No inline model strings anywhere else in the
  codebase.
- **Rationale:** Matches the plan's own mitigation directly; makes a model
  rename or price change a one-file edit.
- **Alternatives considered:** Environment variables only (rejected: prices
  aren't naturally env-var shaped, and a single typed config module is
  easier to unit-test and to update deliberately with a dated comment).
- **Approved by:** Self-approved (directly specified by the plan).
- **Status:** Active.
