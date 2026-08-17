const assert = require("node:assert/strict");
const test = require("node:test");
const { findManifestExercise } = require("../out/adaptive/courseManifest");
const { chooseCourseRecommendation } = require("../out/adaptive/courseRecommendation");
const { taskSpecFromExercise } = require("../out/adaptive/taskSpec");

test("exercise 1.2 has expert concept metadata", () => {
  const exercise = findManifestExercise("exercise-1_2");
  assert.ok(exercise);
  assert.equal(exercise.primaryConcept, "arithmetic_operations");
  assert.deepEqual(exercise.targetConcepts, [
    "variables",
    "arithmetic_operations",
    "unit_conversion",
    "sequential_assignment"
  ]);
});

test("course recommendation prefers explicit next exercises", () => {
  const exercise = findManifestExercise("exercise-1_2");
  const recommendation = chooseCourseRecommendation({
    taskSpec: taskSpecFromExercise(exercise),
    action: "SIMILAR",
    attemptedExerciseIds: []
  });
  assert.ok(recommendation);
  assert.equal(recommendation.exerciseId, "exercise-1_3");
  assert.equal(recommendation.source, "next_exercises");
  assert.equal(recommendation.generatedFallbackNeeded, false);
});

test("course recommendation skips already attempted next exercises", () => {
  const exercise = findManifestExercise("exercise-1_2");
  const recommendation = chooseCourseRecommendation({
    taskSpec: taskSpecFromExercise(exercise),
    action: "SIMILAR",
    attemptedExerciseIds: ["exercise-1_3"]
  });
  assert.ok(recommendation);
  assert.equal(recommendation.exerciseId, "exercise-1_4");
});
