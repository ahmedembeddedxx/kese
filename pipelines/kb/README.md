# pipelines/kb

Crawl → extract → structure → clean → embed pipeline for Mend's
knowledge base (see the technical plan's "Knowledge base and scraping
pipeline" section, and `CLAUDE.md`).

## What's implemented and tested

- `schema.py` -- `SourceConfig` (source registry) and `KBDocument` /
  `KBChunk` (the normalized schema), both real Pydantic models.
- `registry.py` -- loads and validates `sources/*.yaml`.
- `extract.py` -- HTML → markdown (trafilatura), PDF → text (PyMuPDF).
  Real, tested against local fixtures.
- `structure.py` -- builds a `KBDocument`, with two real heuristics
  (numbered/bulleted step extraction, error-code regex matching).
- `clean.py` -- MinHash near-duplicate detection (real, tested) and a
  pluggable quality scorer (`heuristic_quality_score` is a documented
  crude fallback, not the plan's LLM-based quality score).
- `embed.py` -- chunking to ~500-token pieces (word-count approximation)
  and writing to Firestore's `kb_chunks` collection. The embedding call
  itself is injected (`embedder: Callable[[str], list[float]]`), not
  hardcoded to a live Gemini call, so this is testable without a key.
- `cli.py` -- `sources` (list the registry) and `extract` (run
  extract+structure on one local file and print the result) for
  debugging a source before running it at scale.

## What's intentionally not implemented yet

- **`crawl.py`'s `crawl_html_source`** is written against `crawl4ai`'s
  documented API but `crawl4ai` is an optional extra
  (`pip install .[crawl]`), not installed or exercised here -- there is
  no real, licence-checked source list yet (see `sources/README.md`), and
  it carries a Playwright browser dependency not worth bundling into
  every dev environment that only needs the offline steps. `download_pdf`
  (plain `httpx` GET) is real and needs no extra.
- **Scanned-PDF / wiring-diagram extraction via a vision model** (the
  plan's "Flash-Lite model that returns text, tables and a description of
  each diagram"). `extract_pdf` raises clearly when a PDF has no text
  layer instead of silently returning nothing; wiring in the vision-model
  fallback is a follow-up.
- **The LLM quality score** from the plan ("drop low-quality pages with
  an LLM quality score"). `clean.filter_low_quality` takes a `scorer`
  callable for this; only a crude length/steps heuristic is wired in by
  default.
- **A real source registry.** `sources/*.example.yaml` are templates with
  placeholder URLs -- see `sources/README.md` for what's required before
  adding a real one (robots.txt check, real licence, a polite rate
  limit).
- **The Cloud Run Job entrypoint** that runs this on a weekly
  `Cloud Scheduler` trigger. `cli.py` is a local debugging tool, not that
  job yet.
- **Playbook drafting from indexed sources** (the plan's step 7). Writing
  a playbook from KB sources is a judgment call the plan itself says needs
  a human safety review before going live (see `AGENTS.md` "safety is a
  feature") -- not something to automate un-reviewed.

## Running locally

```bash
cd pipelines/kb
uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install -e ".[dev]"
pytest -q

# Debug a single local file against the real extract+structure steps:
python -m kb_pipeline.cli extract some-manual.pdf \
  --category electrical --source-url https://example.com/manual.pdf \
  --licence "retrieval-only, cite source"
```
