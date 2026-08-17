"""Adaptive feedback-to-action decision layer.

This package is a small, local prototype designed to sit after a
Cellmate-style feedback/test workflow.  It does not replace Cellmate; it
turns test evidence into a support format and a next learning action.
"""

from .adapter import recommendation_from_cellmate_event, recommendation_to_markdown
from .engine import AdaptiveCoach
from .exercises import EXERCISES, get_exercise
from .models import (
    AttemptEvidence,
    CoachRecommendation,
    ExerciseSpec,
    GeneratedExercise,
    HiddenTestRun,
    TestCase,
    TestResult,
)

__all__ = [
    "AdaptiveCoach",
    "AttemptEvidence",
    "CoachRecommendation",
    "EXERCISES",
    "ExerciseSpec",
    "GeneratedExercise",
    "HiddenTestRun",
    "TestCase",
    "TestResult",
    "get_exercise",
    "recommendation_from_cellmate_event",
    "recommendation_to_markdown",
]
