"""Notebook/Cellmate-facing adapter helpers."""

from __future__ import annotations

import ast
import re
from typing import Any

from .engine import AdaptiveCoach
from .exercises import get_exercise
from .models import AttemptEvidence, CoachRecommendation, HiddenTestRun, TestResult


def recommendation_from_cellmate_event(
    event: dict[str, Any], coach: AdaptiveCoach | None = None
) -> dict[str, Any]:
    """Return a serialisable recommendation from a Cellmate-like event.

    The adapter accepts both the early Python prototype shape and the closer
    Cellmate shape observed in the TypeScript extension:

    Prototype shape:
    {
        "exercise_id": "sum_numbers",
        "student_code": "...",
        "attempt_count": 2,
        "previous_mistake_types": ["accumulator_update_error"]
    }

    Cellmate-like shape:
    {
        "exerciseId": "sum_numbers",
        "code": "...",
        "attemptCount": 2,
        "testResult": {
            "stdout": "...",
            "stderr": "...",
            "timeout": false,
            "report": {"tests": [...]}
        },
        "metadata": {...}
    }
    """

    exercise_id = event.get("exercise_id") or event.get("exerciseId")
    student_code = event.get("student_code") or event.get("code") or ""
    if not exercise_id:
        raise KeyError("Cellmate event requires exercise_id or exerciseId")

    raw_test_result = event.get("testResult") or event.get("pytestReport")
    test_run = (
        _hidden_test_run_from_cellmate_result(raw_test_result, exercise_id)
        if raw_test_result is not None
        else None
    )

    evidence = AttemptEvidence(
        exercise_id=exercise_id,
        student_code=student_code,
        attempt_count=int(event.get("attempt_count", event.get("attemptCount", 1))),
        previous_mistake_types=list(
            event.get("previous_mistake_types", event.get("previousMistakeTypes", []))
        ),
        test_run=test_run,
    )
    return (coach or AdaptiveCoach()).recommend(evidence).to_dict()


def recommendation_to_markdown(recommendation: CoachRecommendation | dict[str, Any]) -> str:
    """Render a recommendation as notebook-friendly Markdown."""

    data = (
        recommendation.to_dict()
        if isinstance(recommendation, CoachRecommendation)
        else recommendation
    )
    status = "Correct" if data["correct"] else "Needs work"
    lines = [
        f"### Adaptive coach: {status}",
        "",
        f"- **Mistake type:** `{data['mistake_type']}`",
        f"- **Support format:** `{data['support_format']}`",
        f"- **Next action:** `{data['next_action']}`",
        "",
        "#### Support",
        data["support_content"],
    ]
    generated = data.get("generated_exercise")
    if generated:
        lines.extend(
            [
                "",
                "#### Generated follow-up exercise",
                f"**{generated['title']}**",
                "",
                generated["prompt"],
                "",
                "```python",
                generated["starter_code"].rstrip(),
                "```",
            ]
        )
    return "\n".join(lines)


def _hidden_test_run_from_cellmate_result(
    raw_test_result: dict[str, Any], exercise_id: str
) -> HiddenTestRun:
    """Convert Cellmate's pytest-json-report result into local test evidence."""

    exercise = get_exercise(exercise_id)
    timed_out = bool(raw_test_result.get("timeout", raw_test_result.get("timed_out", False)))
    stdout = str(raw_test_result.get("stdout", ""))
    stderr = str(raw_test_result.get("stderr", ""))

    if timed_out:
        return HiddenTestRun(
            results=[
                TestResult(case.name, passed=False, expected=case.expected, error="timeout")
                for case in exercise.test_cases
            ],
            stdout=stdout,
            stderr=stderr,
            timed_out=True,
        )

    report = raw_test_result.get("report", raw_test_result)
    report_tests = report.get("tests", [])
    expected_by_name = {case.name: case.expected for case in exercise.test_cases}
    results: list[TestResult] = []

    for test in report_tests:
        name = _normalise_test_name(str(test.get("nodeid") or test.get("name") or ""))
        expected = expected_by_name.get(name)
        outcome = str(test.get("outcome", "")).lower()
        passed = outcome == "passed"

        if passed:
            results.append(TestResult(name, passed=True, expected=expected, actual=expected))
            continue

        message = _extract_assertion_message(test)
        actual, parsed_expected = _parse_assertion_values(message)
        if expected is None:
            expected = parsed_expected
        error = None if actual is not None and expected is not None else message
        results.append(
            TestResult(
                name=name,
                passed=False,
                expected=expected,
                actual=actual,
                error=error,
            )
        )

    if not results:
        results = [
            TestResult(case.name, passed=False, expected=case.expected, error="no pytest report")
            for case in exercise.test_cases
        ]

    return HiddenTestRun(results=results, stdout=stdout, stderr=stderr, timed_out=False)


def _extract_assertion_message(test: dict[str, Any]) -> str:
    """Pull the shortest useful failure message from pytest-json-report output."""

    call = test.get("call") or {}
    longrepr = call.get("longrepr")
    if isinstance(longrepr, dict):
        reprcrash = longrepr.get("reprcrash") or {}
        message = reprcrash.get("message")
        if message:
            return str(message)
        if longrepr.get("longrepr"):
            return str(longrepr["longrepr"])
    if longrepr:
        return str(longrepr)
    if call.get("crash"):
        return str(call["crash"])
    return str(test.get("message", "test failed"))


def _parse_assertion_values(message: str) -> tuple[Any | None, Any | None]:
    """Parse simple pytest messages such as ``assert 4 == 10``."""

    match = re.search(r"assert\s+(.+?)\s*==\s*(.+?)(?:\n|$)", message)
    if not match:
        return None, None
    actual = _literal_or_text(match.group(1).strip())
    expected = _literal_or_text(match.group(2).strip())
    return actual, expected


def _literal_or_text(value: str) -> Any:
    try:
        return ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return value


def _normalise_test_name(nodeid: str) -> str:
    """Map pytest node ids to the exercise case names used by the prototype."""

    raw_name = nodeid.split("::")[-1]
    raw_name = raw_name.split("[", 1)[0]
    raw_name = re.sub(r"^test_", "", raw_name)
    return raw_name.replace("_", " ").strip()
