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

## D-011 - main branch created from the claude branch tip, no empty-root PR
- **Date:** 2026-10-03
- **Context:** The repo had no `main` branch at all (truly empty before
  this session). Creating it as a clean empty/orphan branch (so a PR into
  it would show the whole build as one diff) needed a local
  `git checkout --orphan` + forced unstage, which this session's
  "Git Destructive" safety classifier blocked outright; a
  `gh api -X PATCH .../mend` to flip the default branch was separately
  blocked by the GitHub proxy ("Repository settings writes are not
  permitted through this proxy"). Ahmed then said to just create `main`
  and make it default.
- **Decision:** Created `main` via the GitHub API's branch-creation
  endpoint (an additive ref creation, not a settings write, so it wasn't
  blocked) pointed at the exact tip of `claude/dazzling-mendel-wzr1ar`
  (commit `e35cd7f`, everything built this session). Ahmed then set it as
  the repo's default branch himself via the GitHub UI (Settings ->
  Branches), the one step the proxy wouldn't let this session do. Since
  `main` and `claude/dazzling-mendel-wzr1ar` are now identical commits,
  no PR was opened for this round -- there is nothing to diff. Future
  work continues on `claude/dazzling-mendel-wzr1ar` as instructed, with
  real PRs into `main` once the two branches diverge again.
- **Rationale:** Two independent, unrelated safety/policy layers blocked
  the originally planned approach (empty orphan `main` + a full-build
  PR); branching off the existing tip was the next-best option that
  neither layer blocked, and gets to the same end state (a populated,
  default `main`) without fighting either restriction.
- **Alternatives considered:** Asking for the git-destructive permission
  to be granted (rejected: Ahmed's own instruction was simpler and
  didn't need it); an empty-root `main` with a real PR (rejected: both
  blocked, see Context).
- **Approved by:** Ahmed (explicit instruction: "create a main branch and
  make it default").
- **Status:** Active.

## D-012 - apple-design skill is installed by reference, not vendored
- **Date:** 2026-10-05
- **Context:** Ahmed asked for https://github.com/dickwu/apple-design-skill
  to be added to the flow and used for the UI rebuild. The skill bundles
  Apple's Human Interface Guidelines text.
- **Decision:** `scripts/install-skills.sh` clones the skill at a pinned
  commit (`904b0ee`) into `.claude/skills/apple-design`, which is
  gitignored. `AGENTS.md` rule 12 requires `/apple-design` for UI work.
- **Rationale:** The HIG text is Apple's content; committing a copy into
  this repo is a redistribution question nobody has signed off on. A
  pinned install script gives every checkout and every model the same
  skill without that risk, and the pin stops upstream changes silently
  altering design guidance.
- **Alternatives considered:** Vendoring the skill folder (rejected:
  redistribution); relying on a global install (rejected: not
  reproducible across sessions and models).
- **Approved by:** Ahmed (asked for the skill to be added); the by-reference
  mechanism is self-approved (low risk, reversible).
- **Status:** Active.

## D-013 - Voice stack: Gemini sees, ElevenLabs hears and speaks Urdu
- **Date:** 2026-10-05
- **Context:** Ahmed wants a Gemini-Live-style voice agent that speaks
  Urdu well. He first suggested Wispr Flow, then corrected: it has no
  public API, use ElevenLabs. Verified against ElevenLabs' raw docs:
  Scribe v2 Realtime supports Urdu (`urd`); Urdu TTS exists only on the
  `eleven_v3`/`eleven_v4` families (Flash and Multilingual v2 lack it), and
  `eleven_v4_turbo` streams over the text-to-dialogue WebSocket.
- **Decision:** Gemini Live runs in TEXT mode (still sees one JPEG per
  second and calls tools). ElevenLabs Scribe v2 Realtime is the ears and
  `eleven_v4_turbo` is the mouth. The backend mints single-use ElevenLabs
  tokens (`/session` returns the first pair, `/voice/token` mints more
  because tokens are consumed on connect) and resolves the ACTIVE provider
  server-side. Any missing config, mint failure or mid-session voice
  failure falls back to Gemini native audio (a restart on the Gemini
  stack, once). `/session` now refuses without `consent: true`. The
  Gemini ephemeral token is multi-use (`uses=6`) with session resumption
  and context-window compression locked in, so the ~2 minute audio+video
  limit and `goAway` reconnects do not end a repair.
- **Rationale:** Gemini's own Urdu voice is the weaker part of the pipeline;
  ElevenLabs is the better Urdu voice while Gemini remains the only part
  that understands the camera. Fallback honours "the customer must never
  be left without a voice".
- **Alternatives considered:** Wispr Flow (rejected: no API, STT only);
  ElevenLabs Conversational Agents (rejected: would replace Gemini as the
  brain and lose the video understanding); keeping Gemini audio only
  (kept as the fallback).
- **Approved by:** Ahmed (chose ElevenLabs); fallback design self-approved.
- **Status:** Active. NOT yet exercised against live keys. Unverified:
  whether the text-to-dialogue endpoint accepts a `tts_websocket` token and
  returns `pcm_24000`; whether Gemini accepts TEXT responses together with
  `outputAudioTranscription`; resumption on the same multi-use token.
  Echo/barge-in tuning needs a real phone.

## D-014 - UI direction: full-screen camera, glass controls, no canned buttons
- **Date:** 2026-10-05
- **Context:** "UI is fucked up, match Gemini." Camera must be full screen,
  switchable, screen-shareable, with a good voice animation, Urdu voice, and
  no "Repeat" / "I'm stuck" buttons because the agent sees and hears.
- **Decision:** The Live screen is one full-bleed `object-cover` video with
  a single glass control row (flip camera, share screen, voice pill, mic,
  end), captions above it, a step chip (desktop: steps panel) and a torch
  button when supported. Repeat and "I'm stuck" were removed. Urdu is the
  default language (RTL, Nastaliq for reading text, Naskh for compact UI
  labels), persisted in localStorage. One accent colour ("Mend amber").
  The control row keeps a fixed left-to-right order in both languages
  (media-control convention). Safety gates have equal-weight "Not yet" and
  confirm buttons; the decision is sent back to the agent as a text turn,
  and `safety_gate` now returns `waiting_for_user_tap`. Home has one main
  action, three category doors and a full repair list sheet, so every route
  stays reachable. The overlay maps detections through the
  `object-fit: cover` crop and the front-camera mirror (previously boxes
  drifted on any screen whose aspect differed from the camera's). Mic audio
  now runs at 16 kHz (the worklet used the context's native rate, which
  Gemini would have mis-heard). `VITE_MOCK_LIVE=1` drives every visual state
  without keys for design review.
- **Rationale:** Matches the reference the user showed, keeps the camera as
  the hero, and follows the apple-design skill (restraint, 44pt targets,
  contrast, reduced-motion/transparency fallbacks).
- **Alternatives considered:** Gemini blue accent (rejected: looks like a
  clone); LTR-mirroring of the control row (rejected: confuses muscle
  memory).
- **Approved by:** Ahmed (direction); details self-approved.
- **Status:** Active. Visual QA done with Playwright against a fake camera
  only; needs a real phone pass.

## D-015 - English-only UI, multilingual voice, user-selectable voice and models
- **Date:** 2026-10-05
- **Context:** After seeing the Urdu-first UI, Ahmed asked for a nicer font
  (it need not support Urdu), to drop the Urdu language / RTL interface
  ("only the talking part" is multilingual: an English + Urdu model), and
  for options to choose the model, voice and so on.
- **Decision:** Supersedes the "Urdu default, RTL, Nastaliq" part of D-014.
  The interface is English only (Figtree for text, Bricolage Grotesque for
  headings; Noto Naskh stays only as a fallback so Urdu captions, which
  follow what the user speaks, render properly). The session `language` is
  now `auto` by default: Scribe auto-detects (no `language_code`), the
  TTS language code is omitted, Gemini-audio fallback sets no `speechConfig`,
  and the prompt tells the agent to answer in the language the user speaks.
  A settings sheet (Home) lets the user pick the voice engine (ElevenLabs or
  Gemini), the ElevenLabs voice, the speech model (`eleven_v4_turbo` or
  `eleven_v3`) and the vision model. `GET /options` serves the lists;
  `/session` takes optional `voice_id`, `live_model`, `tts_model` and
  rejects anything not in the lists (400 `unknown_model` / `unknown_voice`,
  so a client cannot make us mint tokens for arbitrary models or bill
  arbitrary voices). With only an ElevenLabs key and no configured voice,
  the account's first voice is used rather than dropping to Gemini audio.
  More models can be added by env (`MEND_LIVE_MODEL_OPTIONS_EXTRA`,
  `MEND_TTS_MODEL_OPTIONS_EXTRA`) with no code change.
- **Rationale:** The customer speaks Urdu and English mixed; an interface in
  one language with a voice that follows the speaker is simpler and more
  reliable than a language switch. Server-side allow-lists keep the choice
  safe.
- **Alternatives considered:** Keeping an Urdu UI toggle (rejected by
  Ahmed); free-text model/voice fields (rejected: abuse and cost risk).
- **Approved by:** Ahmed (explicit request).
- **Status:** Active. Unverified: Scribe and Gemini native audio
  auto-detecting Urdu vs English, `eleven_v3` over the text-to-dialogue
  socket, and arbitrary Gemini models inside an ephemeral token.
