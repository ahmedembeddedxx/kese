# decisions.md

## D-001 - Adopt the technical plan's architecture and tech stack as-is
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
- **Approved by:** Ahmed (plan author, self-approved - within existing
  mandate).
- **Status:** Active.

## D-002 - Backend runs on Python 3.12, not the system default 3.11
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

## D-003 - Commit and PR attribution convention
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

## D-004 - Pull Docker base images through the Google Docker Hub mirror
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

## D-005 - Centralize all Gemini/Replicate model IDs and prices
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

## D-006 - Dev-mode bearer token bypass for local/CI testing
- **Date:** 2026-10-03
- **Context:** No Firebase project is configured in this environment yet
  (no project ID, no service account), so the real Firebase ID token flow
  can't be exercised end-to-end locally or in CI. `AGENTS.md` still
  requires everything to run and be tested in Docker Compose before any
  push.
- **Decision:** `app/auth.py` accepts a `dev:<uid>` bearer token as an
  alternate identity source, but only when `Settings.environment` is
  `development` or `test` (`Settings.dev_auth_allowed`); it is refused
  outright when `environment == "production"`, regardless of the token
  sent. Production deploys must set `MEND_ENVIRONMENT=production` for
  this to take effect -- tracked as a deploy-checklist item, not yet
  relevant since nothing is being deployed.
- **Rationale:** Lets the full request/auth/rate-limit/validation path be
  tested honestly (including a real 401 for missing/garbage tokens) without
  a real Firebase project, while keeping the bypass structurally impossible
  in production.
- **Alternatives considered:** Mocking auth only in tests and leaving no
  dev-mode path in the app itself (rejected: would mean nobody could run
  the full stack in Docker Compose locally without a real Firebase project,
  violating the "Docker first" rule); allowing the bypass unconditionally
  (rejected: unsafe, a misconfigured `environment` var in prod would be a
  full auth bypass).
- **Approved by:** Self-approved (low-risk, environment-gated, reversible).
- **Status:** Active.

## D-007 - Merge policy: personal repos may be merged without per-PR sign-off; organization repos never are
- **Date:** 2026-10-03
- **Context:** The team's standing session protocol says "never merge a
  PR into main or staging without explicit sign-off ... only after an
  explicit go-ahead." Ahmed clarified mid-session, for this specific repo
  (`ahmedembeddedxx/mend`, his personal project, not an organization
  repo): PRs can be opened and merged regularly without waiting for
  per-PR approval, partly to build a track record of co-authored, merged
  PRs. He then explicitly drew the boundary: this applies to personal
  projects only -- an organization project is "never" merged without
  sign-off, no exceptions.
- **Decision:** On this repo specifically, PRs that are Docker-tested and
  green may be opened and merged without waiting for an explicit
  per-PR "go ahead." The original default (explicit sign-off required
  before any merge to main/staging) remains fully in force for any
  organization-owned repository, with no exception. This decision does
  not relax anything else in the protocol: Docker-first testing, split
  commits by type, docs updated per PR, and no deploys all still apply
  exactly as before.
- **Rationale:** Explicit, repeated instruction from the repo owner,
  scoped precisely to personal vs. organization repos.
- **Alternatives considered:** Treating it as blanket permission across
  all repos (rejected: directly contradicted by the follow-up "not in
  organization project; never").
- **Approved by:** Ahmed (repo owner, explicit instruction).
- **Status:** Active.

## D-008 - Dev-sandbox-only TLS trust anchor for Docker image builds
- **Date:** 2026-10-03
- **Context:** This container's egress goes through a TLS-inspecting proxy
  (see /root/.ccr/README.md). `docker build` containers don't inherit the
  host's injected trust store, so `pip install` / `npm install` inside a
  build failed with `SELF_SIGNED_CERT_IN_CHAIN`, even for hosts normally
  reachable directly (`pypi.org`), which pointed to transparent,
  network-level interception rather than something fixable by routing
  through `HTTPS_PROXY`.
- **Decision:** `.docker/` is tracked with only a `.gitkeep` placeholder;
  a developer building in this sandbox can drop a gitignored
  `.docker/ca-bundle.crt` there (copied from `/root/.ccr/ca-bundle.crt`).
  `services/api/Dockerfile` and `infra/Dockerfile.firestore-emulator`
  check for that file and, only if present, trust it for the one
  `pip`/`npm install` layer that needs it (`--cert` / `npm config set
  cafile`, never baked into image `ENV`). A normal checkout (CI, any
  other machine) has no such file and the build proceeds exactly as
  before -- this is a no-op everywhere except this specific sandbox.
- **Rationale:** Keeps the committed Dockerfiles portable and correct for
  CI/production while still satisfying "Docker first" local testing in an
  environment with non-standard TLS interception. The cert is public (not
  a secret) but still gitignored, since it is meaningless and
  machine-specific outside this one sandbox.
- **Alternatives considered:** Baking the CA into image `ENV` permanently
  (rejected: would silently narrow the running container's trust store in
  real deployments, breaking real HTTPS calls to Gemini/Replicate);
  `--trusted-host` to skip TLS verification (rejected: AGENTS.md and the
  proxy README both say never disable TLS verification).
- **Approved by:** Self-approved (low-risk, reversible, environment-local).
- **Status:** Active.

## D-009 - Load the AudioWorklet module via a `?worker&url` import, not `new URL(..., import.meta.url)`
- **Date:** 2026-10-03
- **Context:** `apps/web/src/lib/audio/pcmRecorderWorklet.ts` is loaded
  with `audioContext.audioWorklet.addModule(...)`. The natural-looking
  `new URL("./pcmRecorderWorklet.ts", import.meta.url)` works in Vite dev
  mode (the dev server transpiles on request) but silently produces a
  dangling URL in a production build: Vite only special-cases `new
  Worker(new URL(...))` / `new SharedWorker(...)` for bundling a
  referenced module as its own chunk, not an arbitrary `addModule` call,
  so `npm run build` shipped no worklet file at all.
- **Decision:** Import the worklet as
  `import pcmRecorderWorkletUrl from "./pcmRecorderWorklet.ts?worker&url"`
  (a Vite-documented, `vite/client`-typed suffix) and pass that string
  straight to `addModule`. Verified by inspecting `dist/` after a real
  `npm run build`: the worklet now ships as its own transpiled chunk
  (`pcmRecorderWorklet-*.js`, containing `registerProcessor(...)`).
- **Rationale:** `?worker&url` is a real, typed Vite feature for exactly
  this "bundle this file as its own entry and give me its URL" need; it
  happens to be named for Workers but works identically for an
  AudioWorklet module, and it is verified against the actual build
  output rather than assumed correct.
- **Alternatives considered:** `new URL(..., import.meta.url)` (rejected,
  see above -- found broken by inspecting the actual build output, not a
  hypothetical); a separate manual build step to copy the worklet file
  (rejected: more moving parts for the same result).
- **Approved by:** Self-approved (low-risk, verified against real build output).
- **Status:** Active.

## D-010 - KB pipeline: ship extract/structure/clean/embed real and tested; defer crawl4ai and a real source list
- **Date:** 2026-10-03
- **Context:** The plan's KB pipeline has eight steps (source registry,
  crawl, extract, structure, clean, embed, draft playbooks, schedule). No
  real, licence-checked source list exists yet (needs a human to check
  each site's robots.txt/terms before it's added, per the crawler rules),
  and `crawl4ai` carries a Playwright browser dependency not worth
  bundling into every dev environment before there's anything real to
  crawl.
- **Decision:** `pipelines/kb` ships `extract.py` (trafilatura/PyMuPDF),
  `structure.py`, `clean.py` (real MinHash dedup via `datasketch`), and
  `embed.py` (chunking + Firestore write) as real, tested code (32 pytest
  tests, all passing, Docker-verified). `crawl.py`'s `crawl_html_source`
  is written against `crawl4ai`'s documented API but kept as an optional
  extra (`pip install .[crawl]`), not exercised; `download_pdf` (plain
  `httpx`) is real. `sources/*.example.yaml` are templates with
  placeholder URLs and a prominent warning not to point the crawler at a
  real site without checking robots.txt/terms and setting a real licence
  field first. Chunk size (~500 tokens) is approximated by word count
  (375 words, documented as an approximation, not an exact tokenizer
  match) since there's no Gemini tokenizer available offline to measure
  exactly. The embedding call is injected as a callable rather than
  hardcoded to a live Gemini call, so the module is testable without a
  key.
- **Rationale:** Every piece that can be genuinely correct and testable
  without a live API key or a vetted source list is real and tested now;
  every piece that depends on either (real crawling, real embeddings, a
  real LLM quality score, playbook auto-drafting) is clearly marked and
  deferred rather than faked, matching the same honesty pattern used for
  `services/api`'s Gemini/Replicate clients.
- **Alternatives considered:** Installing `crawl4ai` and pointing it at a
  placeholder/real-looking URL to "prove it works" (rejected: would mean
  either crawling a real site without a licence check, which the plan's
  own crawler rules and AGENTS.md forbid, or crawling a fake URL that
  proves nothing); hardcoding a fixed token-based chunker (rejected:
  needs a tokenizer dependency for no real accuracy gain at this stage).
- **Approved by:** Self-approved (matches the plan's own stated
  constraints and AGENTS.md's crawler rules).
- **Status:** Active.
