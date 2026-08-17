"""Rule-based mistake classification for the first adaptive-coach prototype."""

from __future__ import annotations

from .models import ExerciseSpec, HiddenTestRun


NO_MISTAKE = "none"
ACCUMULATOR_UPDATE_ERROR = "accumulator_update_error"
CONDITIONAL_FILTERING_ERROR = "conditional_filtering_error"
BOUNDARY_CONDITION_ERROR = "boundary_condition_error"
RUNTIME_ERROR = "runtime_error"
TIMEOUT_ERROR = "timeout"
UNKNOWN_LOGIC_ERROR = "unknown_logic_error"


def classify_mistake(exercise: ExerciseSpec, test_run: HiddenTestRun) -> str:
    """Classify a failed attempt using transparent task-specific rules."""

    if test_run.passed:
        return NO_MISTAKE
    if test_run.timed_out:
        return TIMEOUT_ERROR
    if any(result.error for result in test_run.results):
        return RUNTIME_ERROR

    if exercise.exercise_id == "sum_numbers" and _looks_like_final_item(test_run):
        return ACCUMULATOR_UPDATE_ERROR
    if exercise.exercise_id == "sum_positive" and _looks_like_unfiltered_sum(test_run):
        return CONDITIONAL_FILTERING_ERROR
    if exercise.exercise_id == "count_at_least" and _looks_like_strict_boundary(test_run):
        return BOUNDARY_CONDITION_ERROR

    return UNKNOWN_LOGIC_ERROR


def _looks_like_final_item(test_run: HiddenTestRun) -> bool:
    matches = 0
    checked = 0
    for result in test_run.results:
        if result.passed:
            continue
        values = _first_arg_from_result_name(test_run, result.name)
        if values:
            checked += 1
            if result.actual == values[-1]:
                matches += 1
    return checked > 0 and matches == checked


def _looks_like_unfiltered_sum(test_run: HiddenTestRun) -> bool:
    matches = 0
    checked = 0
    case_values = {
        "mixed positives": [-2, 3, 4],
        "all negative": [-1, -5],
        "includes zero": [0, 2, -1, 5],
    }
    for result in test_run.results:
        if result.passed:
            continue
        values = case_values.get(result.name)
        if values is not None:
            checked += 1
            if result.actual == sum(values):
                matches += 1
    return checked > 0 and matches == checked


def _looks_like_strict_boundary(test_run: HiddenTestRun) -> bool:
    expected_for_strict_greater_than = {
        "threshold included": 1,
        "single boundary value": 0,
        "no matching values": 0,
    }
    matches = 0
    checked = 0
    for result in test_run.results:
        if result.passed:
            continue
        if result.name in expected_for_strict_greater_than:
            checked += 1
            if result.actual == expected_for_strict_greater_than[result.name]:
                matches += 1
    return checked > 0 and matches == checked


def _first_arg_from_result_name(test_run: HiddenTestRun, name: str) -> list[int] | None:
    known_inputs = {
        "positive list": [1, 2, 3, 4],
        "mixed list": [-2, 3, 4],
        "empty list": [],
    }
    return known_inputs.get(name)
