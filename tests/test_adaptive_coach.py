import ast
import unittest

from adaptive_coach import (
    AdaptiveCoach,
    AttemptEvidence,
    recommendation_from_cellmate_event,
)


class TestAdaptiveCoach(unittest.TestCase):
    def setUp(self):
        self.coach = AdaptiveCoach(timeout_seconds=1.0)

    def test_correct_solution_gets_harder_extension(self):
        code = """
def sum_numbers(values):
    total = 0
    for value in values:
        total = total + value
    return total
"""
        rec = self.coach.recommend(AttemptEvidence("sum_numbers", code))

        self.assertTrue(rec.correct)
        self.assertEqual(rec.mistake_type, "none")
        self.assertEqual(rec.next_action, "harder_extension")
        self.assertIsNotNone(rec.generated_exercise)

    def test_accumulator_update_error_is_classified(self):
        code = """
def sum_numbers(values):
    total = 0
    for value in values:
        total = value
    return total
"""
        rec = self.coach.recommend(
            AttemptEvidence(
                "sum_numbers",
                code,
                attempt_count=3,
                previous_mistake_types=["accumulator_update_error"],
            )
        )

        self.assertFalse(rec.correct)
        self.assertEqual(rec.mistake_type, "accumulator_update_error")
        self.assertEqual(rec.support_format, "state_update_table")
        self.assertEqual(rec.next_action, "easier_intermediate_exercise")

    def test_conditional_filtering_error_is_classified(self):
        code = """
def sum_positive(values):
    total = 0
    for value in values:
        total = total + value
    return total
"""
        rec = self.coach.recommend(AttemptEvidence("sum_positive", code))

        self.assertFalse(rec.correct)
        self.assertEqual(rec.mistake_type, "conditional_filtering_error")
        self.assertEqual(rec.support_format, "include_exclude_comparison")

    def test_boundary_condition_error_is_classified(self):
        code = """
def count_at_least(values, threshold):
    count = 0
    for value in values:
        if value > threshold:
            count = count + 1
    return count
"""
        rec = self.coach.recommend(AttemptEvidence("count_at_least", code))

        self.assertFalse(rec.correct)
        self.assertEqual(rec.mistake_type, "boundary_condition_error")
        self.assertEqual(rec.support_format, "boundary_case_comparison")

    def test_timeout_returns_controlled_failure(self):
        code = """
def sum_numbers(values):
    while True:
        pass
"""
        rec = self.coach.recommend(AttemptEvidence("sum_numbers", code))

        self.assertFalse(rec.correct)
        self.assertEqual(rec.mistake_type, "timeout")
        self.assertEqual(rec.next_action, "fix_execution_before_retry")
        self.assertTrue(rec.test_run.timed_out)

    def test_cellmate_like_event_adapter_returns_dict(self):
        event = {
            "exercise_id": "sum_numbers",
            "student_code": """
def sum_numbers(values):
    total = 0
    for value in values:
        total = value
    return total
""",
            "attempt_count": 2,
            "previous_mistake_types": [],
        }

        rec = recommendation_from_cellmate_event(event, coach=self.coach)

        self.assertEqual(rec["mistake_type"], "accumulator_update_error")
        self.assertIn("test_run", rec)

    def test_adapter_accepts_cellmate_pytest_report(self):
        event = {
            "exerciseId": "sum_numbers",
            "code": """
def sum_numbers(values):
    total = 0
    for value in values:
        total = value
    return total
""",
            "attemptCount": 3,
            "previousMistakeTypes": ["accumulator_update_error"],
            "testResult": {
                "stdout": "",
                "stderr": "",
                "timeout": False,
                "report": {
                    "tests": [
                        {
                            "nodeid": "test_hidden.py::test_positive_list",
                            "outcome": "failed",
                            "call": {
                                "longrepr": {
                                    "reprcrash": {"message": "assert 4 == 10"}
                                }
                            },
                        },
                        {
                            "nodeid": "test_hidden.py::test_mixed_list",
                            "outcome": "failed",
                            "call": {
                                "longrepr": {
                                    "reprcrash": {"message": "assert 4 == 5"}
                                }
                            },
                        },
                        {
                            "nodeid": "test_hidden.py::test_empty_list",
                            "outcome": "passed",
                        },
                    ]
                },
            },
        }

        rec = recommendation_from_cellmate_event(event, coach=self.coach)

        self.assertEqual(rec["mistake_type"], "accumulator_update_error")
        self.assertEqual(rec["support_format"], "state_update_table")
        self.assertEqual(rec["next_action"], "easier_intermediate_exercise")

    def test_adapter_accepts_cellmate_all_passed_report(self):
        event = {
            "exerciseId": "sum_numbers",
            "code": """
def sum_numbers(values):
    total = 0
    for value in values:
        total = total + value
    return total
""",
            "attemptCount": 1,
            "testResult": {
                "stdout": "",
                "stderr": "",
                "timeout": False,
                "report": {
                    "tests": [
                        {
                            "nodeid": "test_hidden.py::test_positive_list",
                            "outcome": "passed",
                        },
                        {
                            "nodeid": "test_hidden.py::test_mixed_list",
                            "outcome": "passed",
                        },
                        {
                            "nodeid": "test_hidden.py::test_empty_list",
                            "outcome": "passed",
                        },
                    ]
                },
            },
        }

        rec = recommendation_from_cellmate_event(event, coach=self.coach)

        self.assertTrue(rec["correct"])
        self.assertEqual(rec["mistake_type"], "none")
        self.assertEqual(rec["next_action"], "harder_extension")

    def test_adapter_accepts_cellmate_timeout_result(self):
        event = {
            "exerciseId": "sum_numbers",
            "code": "def sum_numbers(values):\n    while True:\n        pass\n",
            "attemptCount": 1,
            "testResult": {
                "stdout": "",
                "stderr": "",
                "timeout": True,
                "report": {"tests": []},
            },
        }

        rec = recommendation_from_cellmate_event(event, coach=self.coach)

        self.assertFalse(rec["correct"])
        self.assertEqual(rec["mistake_type"], "timeout")
        self.assertEqual(rec["next_action"], "fix_execution_before_retry")
        self.assertTrue(rec["test_run"]["timed_out"])

    def test_generated_exercise_starter_is_valid_python(self):
        code = """
def sum_numbers(values):
    total = 0
    for value in values:
        total = value
    return total
"""
        rec = self.coach.recommend(
            AttemptEvidence(
                "sum_numbers",
                code,
                attempt_count=3,
                previous_mistake_types=["accumulator_update_error"],
            )
        )

        self.assertIsNotNone(rec.generated_exercise)
        ast.parse(rec.generated_exercise.starter_code)


if __name__ == "__main__":
    unittest.main()
