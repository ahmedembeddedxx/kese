# Mend web app

React + TypeScript + Vite PWA. See the repo root `CLAUDE.md` for the full
architecture; this file only covers running this package on its own.

## Develop

```bash
npm install
npm run dev
```

Requires `services/api` running locally (see its README/`.env.example`)
for anything beyond the Home screen's static UI -- set `VITE_API_BASE_URL`
if it's not at the default `http://localhost:8000`.

## Test / typecheck / lint

```bash
npm run test:ci    # Vitest
npm run typecheck   # tsc --noEmit
npm run lint         # oxlint
npm run build        # production build (also typechecks)
```

Prefer `docker compose --profile test up web-test` from `infra/` to run
the full Docker-verified test suite the same way CI does.
