# Build context is the repo root (see infra/docker-compose.yml), for
# consistency with the other two Dockerfiles in this repo.
FROM mirror.gcr.io/library/python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# trafilatura/pymupdf need no system libraries beyond what python:slim
# already has; crawl4ai (optional, see kb_pipeline/crawl.py) is not
# installed in this image.
WORKDIR /app

COPY pipelines/kb/pyproject.toml ./
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

COPY pipelines/kb/kb_pipeline ./kb_pipeline
COPY pipelines/kb/tests ./tests
COPY pipelines/kb/sources ./sources

CMD ["python", "-m", "pytest", "-q"]
