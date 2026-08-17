const assert = require("node:assert/strict");
const test = require("node:test");
const { canonicalConceptId, canonicalConcepts, masteryFor } = require("../out/adaptive/concepts");
const { GenericTaskInferer } = require("../out/adaptive/genericTaskInferer");

test("concept aliases are mapped to canonical learner-state IDs", () => {
  assert.equal(canonicalConceptId("for loops"), "for_loops");
  assert.equal(canonicalConceptId("loops"), "for_loops");
  assert.equal(canonicalConceptId("conditional statements"), "conditionals");
  assert.equal(canonicalConceptId("mathematical operations"), "arithmetic_operations");
  assert.deepEqual(
    canonicalConcepts(["for loops", "loops", "mathematical operations", "conditional statements"]),
    ["for_loops", "arithmetic_operations", "conditionals"]
  );
});

test("generic LLM concepts are canonicalised before becoming a TaskSpec", async () => {
  const inferer = new GenericTaskInferer({
    completeJson: async () => ({
      task_summary: "Implement a total",
      expected_behavior: "Use a loop and a running total.",
      target_concepts: ["for loops", "mathematical operations", "conditional statements"],
      primary_concept: "for loops",
      confidence: 0.8
    })
  });
  const spec = await inferer.infer({
    notebookUri: "file:///demo.ipynb",
    cellIndex: 0,
    currentCode: "",
    currentOutput: "",
    beforeMarkdown: ["Write a loop exercise."],
    afterMarkdown: [],
    nearbyCode: [],
    nearbyOutputs: [],
    nearbyCodeCells: []
  }, "Write a loop exercise.");
  assert.equal(spec.primaryConcept, "for_loops");
  assert.deepEqual(spec.targetConcepts, ["for_loops", "arithmetic_operations", "conditionals"]);
});

test("mastery lookup remains compatible with old alias keys", () => {
  assert.equal(masteryFor({ studentId: "test", mastery: { loops: 75 } }, "for_loops"), 75);
  assert.equal(masteryFor({ studentId: "test", mastery: { "mathematical operations": 82 } }, "arithmetic_operations"), 82);
});
