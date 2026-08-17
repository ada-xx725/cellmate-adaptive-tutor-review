const assert = require("node:assert/strict");
const test = require("node:test");
const {
  courseResultInsertIndex,
  findFollowingCourseCheck
} = require("../out/adaptive/courseNotebookLayout");

test("course check lookup survives old adaptive result cells", () => {
  const cells = [
    "## Exercise 1.2: Convert units",
    "feet = metres / 0.3048",
    "<!-- cellmate-adaptive: source-cell=1 -->\n## Old result",
    "# EXERCISE_ID: generated:exercise-1_2:easier:old",
    "# Visible sanity checks only for generated:exercise-1_2:easier:old",
    "with pybryt.check(pybryt_reference(1, 2)):\n    feet, yards, miles",
    "import numpy as np\n### BEGIN HIDDEN TESTS\nassert np.isclose(feet, 1)",
    "## Formatted printing style"
  ];

  assert.deepEqual(findFollowingCourseCheck(cells, 1), {
    index: 5,
    lecture: 1,
    exercise: 2,
    source: "pybryt"
  });
  assert.equal(courseResultInsertIndex(cells, 1), 7);
});

test("explicit course IDs support following assert checks without PyBryt", () => {
  const cells = [
    "# EXERCISE_ID: exercise-2_4\ndef solve(value):\n    return value",
    "assert solve(2) == 4"
  ];
  assert.deepEqual(findFollowingCourseCheck(cells, 0), {
    index: 1,
    lecture: 2,
    exercise: 4,
    source: "assert"
  });
});

test("ordinary nearby asserts are not promoted to course checks", () => {
  assert.equal(findFollowingCourseCheck(["def solve(): pass", "assert solve() == 1"], 0), undefined);
});

test("adaptive generated checks are skipped before the real course check", () => {
  const cells = [
    "# EXERCISE_ID: exercise-2_4\ndef solve(value):\n    return value",
    "<!-- cellmate-adaptive: source-cell=0 -->\n## Adaptive Next Step",
    "# EXERCISE_ID: generated:exercise-2_4:easier:old",
    "# Visible sanity checks only for generated:exercise-2_4:easier:old\nassert generated_answer()",
    "assert solve(2) == 4"
  ];
  assert.equal(findFollowingCourseCheck(cells, 0)?.index, 4);
});

test("explicit course IDs support pytest and unittest checks", () => {
  assert.equal(findFollowingCourseCheck([
    "# EXERCISE_ID: exercise-3_1\ndef solve(): pass",
    "import pytest\ndef test_solution():\n    assert solve() == 1"
  ], 0)?.source, "pytest");
  assert.equal(findFollowingCourseCheck([
    "# EXERCISE_ID: exercise-3_1\ndef solve(): pass",
    "import unittest\nclass TestSolution(unittest.TestCase): pass"
  ], 0)?.source, "pytest");
});

test("course check lookup stops before the next exercise", () => {
  const cells = [
    "answer without a check",
    "## Exercise 1.3: Another task",
    "with pybryt.check(pybryt_reference(1, 3)):\n    value"
  ];

  assert.equal(findFollowingCourseCheck(cells, 0), undefined);
});
