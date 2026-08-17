"""Data models for the adaptive coach prototype."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass(frozen=True)
class TestCase:
    """One hidden test case for a beginner Python exercise."""

    name: str
    args: list[Any]
    expected: Any


@dataclass(frozen=True)
class ExerciseSpec:
    """Exercise metadata normally owned by a teaching notebook/Cellmate layer."""

    exercise_id: str
    title: str
    prompt: str
    function_name: str
    test_cases: list[TestCase]
    concept_tags: list[str]


@dataclass
class TestResult:
    """Result of running one hidden test against a submitted function."""

    name: str
    passed: bool
    expected: Any
    actual: Any = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class HiddenTestRun:
    """All hidden-test evidence produced for one attempt."""

    results: list[TestResult]
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False

    @property
    def passed(self) -> bool:
        return bool(self.results) and all(result.passed for result in self.results)

    def to_dict(self) -> dict[str, Any]:
        return {
            "passed": self.passed,
            "timed_out": self.timed_out,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "results": [result.to_dict() for result in self.results],
        }


@dataclass
class AttemptEvidence:
    """Evidence available after one submitted notebook/code cell attempt."""

    exercise_id: str
    student_code: str
    attempt_count: int = 1
    previous_mistake_types: list[str] = field(default_factory=list)
    test_run: HiddenTestRun | None = None


@dataclass(frozen=True)
class GeneratedExercise:
    """A small follow-up exercise recommended by the adaptive layer."""

    title: str
    prompt: str
    starter_code: str
    target_concept: str

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class CoachRecommendation:
    """Decision-layer output that can be rendered in a notebook feedback cell."""

    exercise_id: str
    correct: bool
    mistake_type: str
    support_format: str
    support_content: str
    next_action: str
    generated_exercise: GeneratedExercise | None
    test_run: HiddenTestRun

    def to_dict(self) -> dict[str, Any]:
        return {
            "exercise_id": self.exercise_id,
            "correct": self.correct,
            "mistake_type": self.mistake_type,
            "support_format": self.support_format,
            "support_content": self.support_content,
            "next_action": self.next_action,
            "generated_exercise": (
                self.generated_exercise.to_dict() if self.generated_exercise else None
            ),
            "test_run": self.test_run.to_dict(),
        }
