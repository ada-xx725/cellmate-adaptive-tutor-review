"""Built-in beginner Python exercises for the first prototype."""

from __future__ import annotations

from .models import ExerciseSpec, TestCase


EXERCISES: dict[str, ExerciseSpec] = {
    "sum_numbers": ExerciseSpec(
        exercise_id="sum_numbers",
        title="Sum all numbers",
        prompt="Write sum_numbers(values) so it returns the sum of all numbers.",
        function_name="sum_numbers",
        concept_tags=["loops", "accumulator", "variable-update"],
        test_cases=[
            TestCase("positive list", [[1, 2, 3, 4]], 10),
            TestCase("mixed list", [[-2, 3, 4]], 5),
            TestCase("empty list", [[]], 0),
        ],
    ),
    "sum_positive": ExerciseSpec(
        exercise_id="sum_positive",
        title="Sum only positive numbers",
        prompt=(
            "Write sum_positive(values) so it returns the sum of values greater "
            "than zero."
        ),
        function_name="sum_positive",
        concept_tags=["loops", "conditionals", "filtering", "accumulator"],
        test_cases=[
            TestCase("mixed positives", [[-2, 3, 4]], 7),
            TestCase("all negative", [[-1, -5]], 0),
            TestCase("includes zero", [[0, 2, -1, 5]], 7),
        ],
    ),
    "count_at_least": ExerciseSpec(
        exercise_id="count_at_least",
        title="Count values at least a threshold",
        prompt=(
            "Write count_at_least(values, threshold) so it counts values that "
            "are greater than or equal to threshold."
        ),
        function_name="count_at_least",
        concept_tags=["conditionals", "boundary-case", "comparison"],
        test_cases=[
            TestCase("threshold included", [[3, 4, 5], 4], 2),
            TestCase("single boundary value", [[4], 4], 1),
            TestCase("no matching values", [[1, 2, 3], 4], 0),
        ],
    ),
}


def get_exercise(exercise_id: str) -> ExerciseSpec:
    """Return a built-in exercise spec by id."""

    try:
        return EXERCISES[exercise_id]
    except KeyError as exc:
        available = ", ".join(sorted(EXERCISES))
        raise KeyError(f"Unknown exercise_id {exercise_id!r}. Available: {available}") from exc
