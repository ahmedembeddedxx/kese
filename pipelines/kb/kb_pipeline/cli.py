"""Command-line entrypoints for running pipeline steps by hand.

This is a development/debugging tool, not yet the Cloud Run Job
entrypoint the plan describes ("Run the pipeline as a Cloud Run Job,
triggered weekly by Cloud Scheduler") -- that needs a real source list
(see sources/README.md) and the crawl step installed
(`pip install .[crawl]`) before it's worth writing, and is tracked as a
follow-up in README.md.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import click

from kb_pipeline.extract import extract_html, extract_pdf
from kb_pipeline.registry import load_sources
from kb_pipeline.structure import structure_document


@click.group()
def cli() -> None:
    """Mend knowledge-base pipeline."""


@cli.command("sources")
@click.option("--include-examples", is_flag=True, help="Also list the *.example.yaml templates.")
def list_sources(include_examples: bool) -> None:
    """List the registered, licence-checked sources."""
    sources = load_sources(include_examples=include_examples)
    if not sources:
        click.echo("No sources registered yet -- see sources/README.md.")
        return
    for source in sources:
        click.echo(f"{source.id}  [{source.category}/{source.kind}]  {source.start_urls[0]}")


@cli.command("extract")
@click.argument("path", type=click.Path(exists=True, path_type=Path))
@click.option(
    "--category", required=True, type=click.Choice(["electrical", "ac", "car", "general"])
)
@click.option("--source-url", required=True)
@click.option("--licence", required=True)
@click.option("--title", default=None, help="Defaults to the filename.")
def extract_one(
    path: Path, category: str, source_url: str, licence: str, title: str | None
) -> None:
    """Extract + structure a single local HTML or PDF file, and print the
    resulting KBDocument as JSON -- useful for checking a source's output
    before running it through the full pipeline."""
    title = title or path.stem

    if path.suffix.lower() == ".pdf":
        body = extract_pdf(path.read_bytes(), source_name=path.name)
    else:
        body = extract_html(path.read_text(encoding="utf-8"), url=source_url)

    doc = structure_document(
        title=title,
        body_markdown=body,
        category=category,  # type: ignore[arg-type]
        source_url=source_url,
        licence=licence,
    )
    click.echo(json.dumps(doc.model_dump(mode="json"), indent=2, ensure_ascii=False))


def main() -> None:
    cli(sys.argv[1:])


if __name__ == "__main__":
    main()
