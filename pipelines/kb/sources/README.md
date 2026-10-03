# Source registry

One YAML file per source, validated against `kb_pipeline.schema.SourceConfig`.
Each entry is the plan's "URL patterns, category, licence, crawl rules, rate
limit" for one manual, forum, or error-code reference.

**The three `*.example.yaml` files here are templates, not a ready-to-run
registry.** Their `start_urls` are placeholders. Per AGENTS.md and the
plan's own crawler rules ("respect robots.txt and site terms, store the
source and licence for every document, never republish whole"), nobody
should point the crawler at a real site without first:

1. Checking that site's `robots.txt` and terms of service allow automated
   retrieval for this purpose.
2. Filling in the real `licence` field honestly (what the site's terms
   actually allow -- "retrieval only, cite source" is the default
   assumption, never "public domain" unless actually true).
3. Setting a `rate_limit_seconds` that's genuinely polite for that site.

Add a real source by copying the closest example file, filling it in for
one real, licence-checked site, and dropping the `.example` suffix.

## Format

```yaml
id: unique-source-id
category: electrical | ac | car
kind: html | pdf
start_urls:
  - https://example.com/manuals/
url_patterns:
  - "/manuals/.*\\.html$"
licence: "retrieval-only, cite source"
rate_limit_seconds: 2.0
max_pages: 200
notes: "Optional context for whoever reviews this source."
```
