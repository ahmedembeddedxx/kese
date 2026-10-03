from __future__ import annotations

import asyncio

import httpx
import pytest

import kb_pipeline.crawl as crawl_module
from kb_pipeline.crawl import CrawlError, crawl_html_source, download_pdf
from kb_pipeline.schema import SourceConfig


def test_crawl_html_source_raises_clearly_when_crawl4ai_missing():
    source = SourceConfig(
        id="example",
        category="electrical",
        kind="html",
        start_urls=["https://example.com/"],
        licence="x",
    )
    with pytest.raises(CrawlError, match="crawl4ai is not installed"):
        asyncio.run(crawl_html_source(source))


def test_crawl_html_source_rejects_pdf_source():
    source = SourceConfig(
        id="example",
        category="car",
        kind="pdf",
        start_urls=["https://example.com/manual.pdf"],
        licence="x",
    )
    with pytest.raises(CrawlError, match="non-html"):
        asyncio.run(crawl_html_source(source))


def _mock_get(monkeypatch: pytest.MonkeyPatch, response: httpx.Response) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return response

    transport = httpx.MockTransport(handler)
    client = httpx.Client(transport=transport)
    monkeypatch.setattr(crawl_module.httpx, "get", lambda url, **kwargs: client.get(url))


def test_download_pdf_returns_bytes_for_pdf_content_type(monkeypatch: pytest.MonkeyPatch):
    _mock_get(
        monkeypatch,
        httpx.Response(200, headers={"content-type": "application/pdf"}, content=b"%PDF-1.4 fake"),
    )
    content = download_pdf("https://example.com/manual.pdf")
    assert content == b"%PDF-1.4 fake"


def test_download_pdf_rejects_non_pdf_response(monkeypatch: pytest.MonkeyPatch):
    _mock_get(
        monkeypatch,
        httpx.Response(200, headers={"content-type": "text/html"}, content=b"<html></html>"),
    )
    with pytest.raises(CrawlError, match="did not return a PDF"):
        download_pdf("https://example.com/not-a-pdf")
