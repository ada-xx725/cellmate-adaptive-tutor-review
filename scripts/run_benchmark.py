"""Run scripted adaptive-coach checks over Cellmate-style examples."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from adaptive_coach import recommendation_from_cellmate_event


CASES = [
    (
        "accumulator",
        ROOT / "examples" / "cellmate_accumulator_event.json",
        "accumulator_update_error",
        "state_update_table",
        "easier_intermediate_exercise",
    ),
    (
        "successful_retry",
        ROOT / "examples" / "cellmate_successful_retry_event.json",
        "none",
        "short_confirmation",
        "harder_extension",
    ),
    (
        "conditional_filtering",
        ROOT / "examples" / "cellmate_conditional_event.json",
        "conditional_filtering_error",
        "include_exclude_comparison",
        "retry_with_targeted_support",
    ),
    (
        "boundary_condition",
        ROOT / "examples" / "cellmate_boundary_event.json",
        "boundary_condition_error",
        "boundary_case_comparison",
        "retry_with_targeted_support",
    ),
    (
        "timeout",
        ROOT / "examples" / "cellmate_timeout_event.json",
        "timeout",
        "execution_safety_hint",
        "fix_execution_before_retry",
    ),
]


def main() -> int:
    rows = []
    failures = 0
    for name, path, expected_mistake, expected_support, expected_action in CASES:
        event = json.loads(path.read_text(encoding="utf-8"))
        recommendation = recommendation_from_cellmate_event(event)
        passed = (
            recommendation["mistake_type"] == expected_mistake
            and recommendation["support_format"] == expected_support
            and recommendation["next_action"] == expected_action
        )
        failures += 0 if passed else 1
        rows.append(
            [
                name,
                recommendation["mistake_type"],
                recommendation["support_format"],
                recommendation["next_action"],
                "pass" if passed else "fail",
            ]
        )

    headers = ["case", "mistake_type", "support_format", "next_action", "check"]
    widths = [
        max(len(str(row[index])) for row in [headers, *rows])
        for index in range(len(headers))
    ]
    print(" | ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("-+-".join("-" * width for width in widths))
    for row in rows:
        print(" | ".join(str(value).ljust(widths[index]) for index, value in enumerate(row)))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
