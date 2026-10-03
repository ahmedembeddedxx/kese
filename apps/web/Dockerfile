# Build context is the repo root (see infra/docker-compose.yml) for
# consistency with services/api/Dockerfile, even though this image only
# needs apps/web/ -- keeps both Dockerfiles following the same pattern.
#
# See decisions.md D-004 (mirror.gcr.io) and D-008 (the optional,
# gitignored .docker/ca-bundle.crt dev-sandbox TLS workaround).

FROM mirror.gcr.io/library/node:22-slim AS base
WORKDIR /app

COPY apps/web/package.json apps/web/package-lock.json ./
COPY .docker/ /tmp/extra-ca/
RUN set -eu; \
    EXTRA_CERT="/tmp/extra-ca/ca-bundle.crt"; \
    if [ -f "$EXTRA_CERT" ]; then npm config set cafile "$EXTRA_CERT"; fi; \
    npm ci; \
    npm config delete cafile || true; \
    rm -rf /tmp/extra-ca

COPY apps/web/ ./

# `web-test` (docker-compose.yml) targets this stage directly and runs
# `npm run test:ci` against it -- it needs the full source tree and
# devDependencies, which the slimmer runtime stage below doesn't keep.

FROM base AS build
RUN npm run build

# Default target: a small static file server for the production build,
# used by docker-compose's `web` service. The demo itself should run the
# real dev server (`npm run dev`) or a real deploy, per handover.md --
# this is for local Docker Compose smoke-testing only.
FROM mirror.gcr.io/library/node:22-slim AS runtime
WORKDIR /app
COPY .docker/ /tmp/extra-ca/
RUN set -eu; \
    EXTRA_CERT="/tmp/extra-ca/ca-bundle.crt"; \
    if [ -f "$EXTRA_CERT" ]; then npm config set cafile "$EXTRA_CERT"; fi; \
    npm install -g serve@14; \
    npm config delete cafile || true; \
    rm -rf /tmp/extra-ca
COPY --from=build /app/dist ./dist
EXPOSE 5173
CMD ["serve", "-s", "dist", "-l", "5173"]
