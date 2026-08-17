"""Hidden-test runner for the local prototype.

This is intentionally lightweight and only intended for trusted prototype
exercises. It is not a secure sandbox.
"""

from __future__ import annotations

import json
import subprocess
import sys
import textwrap
from typing import Any

from .models import ExerciseSpec, HiddenTestRun, TestResult


def run_hidden_tests(
    student_code: str, exercise: ExerciseSpec, timeout_seconds: float = 2.0
) -> HiddenTestRun:
    """Run exercise tests in a subprocess and return structured evidence."""

    script = _build_test_script(student_code, exercise)
    try:
        completed = subprocess.run(
            [sys.executable, "-c", script],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return HiddenTestRun(
            results=[
                TestResult(
                    name=test_case.name,
                    passed=False,
                    expected=test_case.expected,
                    actual=None,
                    error="timeout",
                )
                for test_case in exercise.test_cases
            ],
            timed_out=True,
        )

    if completed.returncode != 0:
        return _failed_run_from_process_error(completed.stderr, exercise)

    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return _failed_run_from_process_error(completed.stderr or completed.stdout, exercise)

    return HiddenTestRun(
        results=[
            TestResult(
                name=item["name"],
                passed=item["passed"],
                expected=item["expected"],
                actual=item.get("actual"),
                error=item.get("error"),
            )
            for item in payload["results"]
        ],
        stdout=payload.get("stdout", ""),
        stderr=completed.stderr,
        timed_out=False,
    )


def _build_test_script(student_code: str, exercise: ExerciseSpec) -> str:
    cases: list[dict[str, Any]] = [
        {"name": case.name, "args": case.args, "expected": case.expected}
        for case in exercise.test_cases
    ]
    return textwrap.dedent(
        f"""
        import contextlib
        import io
        import json
        import traceback

        student_code = {student_code!r}
        function_name = {exercise.function_name!r}
        cases = {cases!r}
        namespace = {{}}
        stdout_buffer = io.StringIO()
        results = []

        try:
            with contextlib.redirect_stdout(stdout_buffer):
                exec(student_code, namespace)
            func = namespace.get(function_name)
            if not callable(func):
                raise NameError(f"Expected a function named {{function_name}}")
            for case in cases:
                try:
                    with contextlib.redirect_stdout(stdout_buffer):
                        actual = func(*case["args"])
                    results.append({{
                        "name": case["name"],
                        "passed": actual == case["expected"],
                        "expected": case["expected"],
                        "actual": actual,
                        "error": None,
                    }})
                except Exception:
                    results.append({{
                        "name": case["name"],
                        "passed": False,
                        "expected": case["expected"],
                        "actual": None,
                        "error": traceback.format_exc().strip().splitlines()[-1],
                    }})
        except Exception:
            error = traceback.format_exc().strip().splitlines()[-1]
            for case in cases:
                results.append({{
                    "name": case["name"],
                    "passed": False,
                    "expected": case["expected"],
                    "actual": None,
                    "error": error,
                }})

        print(json.dumps({{
            "stdout": stdout_buffer.getvalue(),
            "results": results,
        }}))
        """
    )


def _failed_run_from_process_error(stderr: str, exercise: ExerciseSpec) -> HiddenTestRun:
    message = (stderr or "hidden test runner failed").strip().splitlines()[-1]
    return HiddenTestRun(
        results=[
            TestResult(
                name=test_case.name,
                passed=False,
                expected=test_case.expected,
                actual=None,
                error=message,
            )
            for test_case in exercise.test_cases
        ],
        stderr=stderr,
    )
