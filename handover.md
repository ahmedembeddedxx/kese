# handover.md
_Overwritten every turn. If you're reading this at session start, this is the state you're resuming from._

## Current Task
Built out the full Mend monorepo from `Mend_Technical_Plan.pdf` overnight
while Ahmed slept: backend, frontend, the full playbook breadth list, and
a KB pipeline skeleton. Everything is Docker-tested and committed. Next:
push, open a PR, and merge it (personal repo, see decisions.md D-007).

## Just Done
- **Backend** (`services/api`): all 7 endpoint groups implemented
  (session/detect/segment/kb/devices/events/playbooks/gates), auth
  (Firebase + gated dev-mode bypass), per-user rate limiting, Firestore
  stores, centralized model config. 49 pytest tests, green locally and in
  Docker against the real Firestore emulator.
- **Frontend** (`apps/web`): Home/Live/Done screens, Gemini Live session
  orchestration (camera/mic/WebSocket -- not yet exercised against a real
  key, see "Open Questions"), canvas overlay, the tool-call dispatcher
  (fully unit tested), Zustand stores. 29 Vitest tests green; production
  build verified (including the AudioWorklet chunk, see decisions.md
  D-009); typecheck and oxlint clean.
- **Playbooks**: all 26 from the plan's breadth table (8 electrical, 8
  AC, 10 car), schema-validated. None human-safety-reviewed yet
  (`review.safety_reviewed: false` on every one, honestly) -- that needs
  real hardware per the plan's own gate.
- **KB pipeline** (`pipelines/kb`): extract/structure/clean/embed are
  real and tested (32 pytest tests); crawl is written but not installed/
  exercised (no vetted source list yet, see decisions.md D-010).
- **Infra**: `infra/docker-compose.yml` runs the whole stack plus three
  isolated test profiles (api-test, web-test, kb-pipeline-test), all
  verified green via `docker compose run --rm <service>` individually
  and the firestore-emulator image rebuilt `--no-cache` as a final
  from-scratch sanity check.
- **CI**: `.github/workflows/ci.yml` mirrors the Docker Compose test
  profile exactly, three parallel jobs.
- **Security self-review**: no leaked secrets (grepped the whole repo),
  no API keys in frontend code, every endpoint Pydantic-validated,
  rate-limited where the plan calls for it, Firestore rules scope every
  collection correctly, no raw frame/audio logging anywhere. Found and
  fixed one real issue: four routers were echoing internal exception text
  into 503 responses (mild info-disclosure) -- now logged server-side,
  generic message to the client.
- Em-dash sweep: cleared every em dash from committed docs (AGENTS.md
  rule 9 applies repo-wide, caught a slip in my own early docs).
- 15 commits made, split by type (feat/test/chore/docs/fix), each with
  the `Ibtehaj778` co-author trailer, no Claude attribution anywhere
  (decisions.md D-003), git identity on real GitHub account
  `ahmedembeddedxx`.

## Next Step
1. Push `claude/dazzling-mendel-wzr1ar` (not yet pushed since the last
   docs commit -- everything above is committed locally).
2. Open a PR with the files-changed table + why paragraph already
   drafted (see this session's work).
3. Merge it -- this repo is personal, so per decisions.md D-007 that
   doesn't need to wait for an explicit per-PR go-ahead. (Never do this
   on an organization repo without explicit sign-off.)
4. Keep iterating on remaining scope if there's time: real browser
   testing of the Live session, a real crawled KB source, human safety
   review of playbooks, optical-flow tracking (`apps/web/src/features/
   tracking/` is still an empty stub).

## Open Questions / Blockers (for Ahmed, when awake)
- **Gemini API key and Replicate API token**: still not configured.
  Everything that needs one fails closed with a clear 503 (verified: hit
  `/session` with no key, got a 503, not a crash or a silent fake
  response). The Live session's camera/mic/WebSocket wiring
  (`apps/web/src/features/live/`) is written against the documented SDK
  shapes but genuinely unverified against a live session -- needs a real
  key and a real phone before the first demo.
- **Firebase/GCP project**: still none. Dev-mode auth bypass covers local
  testing; nothing deployed anywhere, as instructed.
- **A real, licence-checked KB source list**: `pipelines/kb/sources/` only
  has templates. Needs a human to check each real site's robots.txt/
  terms before crawling it for real (see `sources/README.md`).
- **Real hardware testing of playbooks**: all 26 are self-authored from
  the plan and general repair knowledge, not field-tested. The plan's own
  gate ("each playbook tested on real fan, AC and car") still needs doing
  before any of them should be trusted on a real repair.
- Hackathon date, which fan/AC/car the team can test on, and the judges'
  panel focus are still open per the plan's own "Open questions" section
  -- none of these block further build work.

## Files Touched This Turn
148 files across `services/api/`, `apps/web/`, `playbooks/`,
`pipelines/kb/`, `infra/`, `.github/workflows/`, and the four standing
docs. See `git log --oneline` on this branch for the full, type-split
commit history (15 commits, each self-describing).
