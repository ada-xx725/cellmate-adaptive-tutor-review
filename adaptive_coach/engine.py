"""Main adaptive decision pipeline."""

from __future__ import annotations

from .classifier import classify_mistake
from .exercises import get_exercise
from .models import AttemptEvidence, CoachRecommendation
from .runner import run_hidden_tests
from .support import (
    build_support_content,
    generate_exercise,
    select_next_action,
    select_support_format,
)


class AdaptiveCoach:
    """Turn Cellmate-style test evidence into adaptive guidance."""

    def __init__(self, timeout_seconds: float = 2.0) -> None:
        self.timeout_seconds = timeout_seconds

    def recommend(self, evidence: AttemptEvidence) -> CoachRecommendation:
        exercise = get_exercise(evidence.exercise_id)
        test_run = evidence.test_run or run_hidden_tests(
            evidence.student_code,
            exercise,
            timeout_seconds=self.timeout_seconds,
        )
        mistake_type = classify_mistake(exercise, test_run)
        support_format = select_support_format(mistake_type)
        next_action = select_next_action(
            correct=test_run.passed,
            mistake_type=mistake_type,
            attempt_count=evidence.attempt_count,
            previous_mistake_types=evidence.previous_mistake_types,
        )

        return CoachRecommendation(
            exercise_id=evidence.exercise_id,
            correct=test_run.passed,
            mistake_type=mistake_type,
            support_format=support_format,
            support_content=build_support_content(mistake_type),
            next_action=next_action,
            generated_exercise=generate_exercise(next_action, mistake_type),
            test_run=test_run,
        )
