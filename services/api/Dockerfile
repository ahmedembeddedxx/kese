# Build context is the repo root (see infra/docker-compose.yml), because
# this image needs both services/api/ and the repo-root playbooks/
# directory (see app/playbooks.py).
#
# See decisions.md D-004: pulled via the Google Docker Hub mirror because
# direct docker.io pulls were rate-limited in the dev environment.
FROM mirror.gcr.io/library/python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    MEND_PLAYBOOKS_DIR=/playbooks

WORKDIR /app

# .docker/ only ever holds a tracked .gitkeep in version control. A
# developer building behind a TLS-inspecting sandbox proxy (see
# decisions.md D-008) can drop an extra, gitignored CA bundle there as
# .docker/ca-bundle.crt; if present, pip trusts it for this install step
# only (never persisted as image ENV, never used at runtime). A normal
# checkout (CI, any other machine) has no such file and this is a no-op.
COPY services/api/pyproject.toml ./
COPY .docker/ /tmp/extra-ca/
RUN set -eu; \
    EXTRA_CERT="/tmp/extra-ca/ca-bundle.crt"; \
    if [ -f "$EXTRA_CERT" ]; then \
      pip install --upgrade pip --cert "$EXTRA_CERT"; \
      pip install -e ".[dev]" --cert "$EXTRA_CERT"; \
    else \
      pip install --upgrade pip; \
      pip install -e ".[dev]"; \
    fi; \
    rm -rf /tmp/extra-ca

COPY services/api/app ./app
COPY services/api/tests ./tests
COPY playbooks /playbooks

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
