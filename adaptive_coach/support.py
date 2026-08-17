"""Support-format and next-action rules."""

from __future__ import annotations

from .classifier import (
    ACCUMULATOR_UPDATE_ERROR,
    BOUNDARY_CONDITION_ERROR,
    CONDITIONAL_FILTERING_ERROR,
    NO_MISTAKE,
    RUNTIME_ERROR,
    TIMEOUT_ERROR,
)
from .models import GeneratedExercise


def select_support_format(mistake_type: str) -> str:
    mapping = {
        NO_MISTAKE: "short_confirmation",
        ACCUMULATOR_UPDATE_ERROR: "state_update_table",
        CONDITIONAL_FILTERING_ERROR: "include_exclude_comparison",
        BOUNDARY_CONDITION_ERROR: "boundary_case_comparison",
        RUNTIME_ERROR: "minimal_debug_hint",
        TIMEOUT_ERROR: "execution_safety_hint",
    }
    return mapping.get(mistake_type, "targeted_hint")


def build_support_content(mistake_type: str) -> str:
    if mistake_type == ACCUMULATOR_UPDATE_ERROR:
        return (
            "The running total is being replaced each time instead of updated.\n\n"
            "| iteration | value | total before | current update | total after |\n"
            "|---:|---:|---:|---|---:|\n"
            "| 1 | 1 | 0 | total = value | 1 |\n"
            "| 2 | 2 | 1 | total = value | 2 |\n"
            "| 3 | 3 | 2 | total = value | 3 |\n"
            "| 4 | 4 | 3 | total = value | 4 |\n\n"
            "The previous total should be kept and combined with the current value."
        )
    if mistake_type == CONDITIONAL_FILTERING_ERROR:
        return (
            "The loop is adding values that should be excluded by the condition.\n\n"
            "| value | should include? | reason |\n"
            "|---:|---|---|\n"
            "| -2 | no | not positive |\n"
            "| 3 | yes | positive |\n"
            "| 4 | yes | positive |\n\n"
            "The update should happen only inside the branch for positive values."
        )
    if mistake_type == BOUNDARY_CONDITION_ERROR:
        return (
            "The boundary value is being left out.\n\n"
            "| value | threshold | should count? |\n"
            "|---:|---:|---|\n"
            "| 3 | 4 | no |\n"
            "| 4 | 4 | yes, because it is equal to the threshold |\n"
            "| 5 | 4 | yes |\n\n"
            "Use an inclusive comparison when the wording says 'at least'."
        )
    if mistake_type == RUNTIME_ERROR:
        return "The code did not run successfully. Fix the reported Python error before changing the algorithm."
    if mistake_type == TIMEOUT_ERROR:
        return "The code took too long to finish. Check for an infinite loop or recursion that does not stop."
    if mistake_type == NO_MISTAKE:
        return "The hidden tests passed. The student is ready for a harder follow-up task."
    return "The output differs from the expected result. Compare one failing input by hand before retrying."


def select_next_action(
    correct: bool, mistake_type: str, attempt_count: int, previous_mistake_types: list[str]
) -> str:
    if correct:
        return "harder_extension"
    if mistake_type in {RUNTIME_ERROR, TIMEOUT_ERROR}:
        return "fix_execution_before_retry"
    repeated_same_mistake = mistake_type in previous_mistake_types or attempt_count >= 3
    if repeated_same_mistake:
        return "easier_intermediate_exercise"
    return "retry_with_targeted_support"


def generate_exercise(next_action: str, mistake_type: str) -> GeneratedExercise | None:
    if next_action == "harder_extension":
        return GeneratedExercise(
            title="Extension: sum positive numbers",
            prompt="Write sum_positive(values). Only values greater than zero should be added.",
            starter_code=(
                "def sum_positive(values):\n"
                "    total = 0\n"
                "    for value in values:\n"
                "        # add only positive values\n"
                "        pass\n"
                "    return total\n"
            ),
            target_concept="conditional filtering with an accumulator",
        )
    if next_action == "easier_intermediate_exercise":
        if mistake_type == ACCUMULATOR_UPDATE_ERROR:
            return GeneratedExercise(
                title="Intermediate: update a running total",
                prompt="Complete the update line so total becomes 5 after adding 2 and 3.",
                starter_code=(
                    "total = 0\n"
                    "for value in [2, 3]:\n"
                    "    total = ...  # replace ... with the update expression\n"
                    "\n"
                    "total\n"
                ),
                target_concept="accumulator update",
            )
        if mistake_type == CONDITIONAL_FILTERING_ERROR:
            return GeneratedExercise(
                title="Intermediate: choose values to include",
                prompt="Mark which values in [-2, 3, 4] should be included in a positive-only sum.",
                starter_code=(
                    "values = [-2, 3, 4]\n"
                    "included_values = ...  # replace ... with a list\n"
                    "included_values\n"
                ),
                target_concept="conditional filtering",
            )
        if mistake_type == BOUNDARY_CONDITION_ERROR:
            return GeneratedExercise(
                title="Intermediate: test the boundary",
                prompt="Decide whether value 4 should count when the threshold is 4.",
                starter_code=(
                    "value = 4\n"
                    "threshold = 4\n"
                    "should_count = ...  # replace ... with True or False\n"
                    "should_count\n"
                ),
                target_concept="inclusive boundary condition",
            )
    return None
