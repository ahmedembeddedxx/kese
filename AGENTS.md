# AGENTS.md

Rules for any coding agent (Claude or otherwise) working in this repo.
Taken from the Mend technical plan's "Instructions for Claude" and the
team's own session protocol. These are not suggestions.

1. **Read first, every session.** `CLAUDE.md` (architecture and file map),
   then `handover.md` (current state). Read `decisions.md` when touching an
   area that has a past decision.
2. **Update docs as you go, not at the end.** Structural changes go in
   `CLAUDE.md` immediately. Judgment calls go in `decisions.md` as a new
   numbered entry (D-00N) with explicit approval status. Rewrite
   `handover.md` in full at the end of every session/turn that did real
   work - it is overwritten, never appended to.
3. **Security review before every PR.** No API keys in the browser
   (ephemeral tokens only). Validate every request body with Pydantic. Cap
   upload size and rate-limit `/detect` and `/session` per user. Never log
   raw frames or audio. Check Firestore security rules so users only read
   their own data, plan devices and pins.
4. **Docker first.** Run the full stack and its tests in Docker Compose
   locally before pushing. After a PR is open, batch fixes into as few
   pushes as possible - pushes cost CI minutes.
5. **Commits split by type:** `feat:`, `test:`, `docs:`, `chore:`, each
   touching only its own files. No empty/placeholder commits.
6. **PR description:** a table of files changed, then a short "Why"
   paragraph. Every PR updates the relevant docs (`CLAUDE.md`,
   `decisions.md`, and/or `handover.md`).
7. **Never merge to `main` or `staging`** without an explicit go-ahead from
   the team in those exact words or equivalent.
8. **Safety is a feature.** Any change to a playbook's safety steps or
   gates needs a human review, noted in the PR.
9. **No em dashes** in code comments, UI copy or docs.
10. **Customer-first, n-to-n access.** Anything a user could do in the app,
    they should be able to do through the agent / MCP tools too, and
    nothing promised in the UI should silently be missing data. If a
    feature exposes data in the app, the same data must be reachable
    through the equivalent API/agent path. Flag any gap found, don't ship
    around it quietly.
11. **Graphify as the primary context partner.** Use the Graphify skill
    (when available in the session) to maintain the graph-based memory map
    of this codebase alongside `CLAUDE.md`, so navigation between files
    stays fast across sessions and model switches.

## Model identifiers

Every Gemini/Replicate model ID, price, and quota referenced anywhere in
the codebase must come from `services/api/app/config.py`. Never hardcode a
model string or price inline - they change (see `decisions.md`).
