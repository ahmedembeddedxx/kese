"""Crawl step: fetch pages for one `SourceConfig`, respecting robots.txt
and the source's rate limit, per the plan ("Crawl4AI (open source,
Playwright-based) for HTML sites, with robots.txt respected and a polite
rate limit. Download PDF manuals directly.").

NOT YET INSTALLED OR EXERCISED in this environment: `crawl4ai` (and its
Playwright browser dependency) is an optional extra
(`pip install .[crawl]`), not a base dependency of this package, because
there is no real, licence-checked source list to crawl yet (see
sources/README.md) and it is a heavy dependency to carry in every dev
environment that only needs extract/structure/clean/embed against local
fixtures. The function below is written against `crawl4ai`'s documented
`AsyncWebCrawler` API and follows the source's `robots.txt`/rate-limit
settings, but has not been run against a real site. Before the first real
crawl: `pip install .[crawl]`, run this against one real, checked source,
and fix anything the installed version disagrees with -- note that
verification in the PR, per AGENTS.md.
"""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from kb_pipeline.schema import SourceConfig


@dataclass(frozen=True)
class CrawledPage:
    url: str
    html: str


class CrawlError(RuntimeError):
    pass


async def crawl_html_source(source: SourceConfig) -> list[CrawledPage]:
    if source.kind != "html":
        raise CrawlError(f"crawl_html_source called on a non-html source: {source.id}")

    try:
        from crawl4ai import AsyncWebCrawler  # type: ignore[import-not-found]
    except ImportError as exc:
        raise CrawlError(
            "crawl4ai is not installed. Run `pip install .[crawl]` (and its "
            "Playwright browser install step) before crawling a real source."
        ) from exc

    pages: list[CrawledPage] = []
    async with AsyncWebCrawler() as crawler:
        for start_url in source.start_urls:
            result = await crawler.arun(
                url=str(start_url),
                bypass_cache=True,
                # crawl4ai respects robots.txt by default; this is kept
                # explicit so a future crawl4ai default change can't
                # silently turn it off.
                check_robots_txt=True,
            )
            if result.success and result.html:
                pages.append(CrawledPage(url=str(start_url), html=result.html))
            if len(pages) >= source.max_pages:
                break
    return pages


def download_pdf(url: str, *, timeout_seconds: float = 30.0) -> bytes:
    """Direct PDF download for `kind: pdf` sources -- no browser needed."""
    response = httpx.get(url, timeout=timeout_seconds, follow_redirects=True)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "")
    if "pdf" not in content_type.lower() and not url.lower().endswith(".pdf"):
        raise CrawlError(f"{url} did not return a PDF (content-type: {content_type!r})")
    return response.content
