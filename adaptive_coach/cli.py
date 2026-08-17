"""Command-line bridge for Cellmate-style adaptive recommendations."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .adapter import recommendation_from_cellmate_event, recommendation_to_markdown


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate an adaptive recommendation from a Cellmate-style event JSON file."
    )
    parser.add_argument("event_json", help="Path to a Cellmate-style JSON event.")
    parser.add_argument(
        "--format",
        choices=["json", "markdown"],
        default="json",
        help="Output format. Defaults to JSON.",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    event_path = Path(args.event_json)

    try:
        event: dict[str, Any] = json.loads(event_path.read_text(encoding="utf-8"))
        recommendation = recommendation_from_cellmate_event(event)
    except Exception as exc:
        print(f"adaptive_coach error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    if args.format == "markdown":
        print(recommendation_to_markdown(recommendation))
    else:
        print(json.dumps(recommendation, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
