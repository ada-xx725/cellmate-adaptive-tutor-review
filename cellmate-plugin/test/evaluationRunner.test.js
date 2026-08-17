const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const { evaluateStates, parseStates } = require("../out-evaluation/evaluation/runPolicies");

test("policy runner evaluates the same state under all three policies", () => {
  const states = parseStates(`${JSON.stringify(state())}\n`);
  const results = evaluateStates(states);
  assert.equal(results.length, 3);
  assert.deepEqual(results.map((result) => result.policy), ["fixed", "no_history", "full_adaptive"]);
  assert.equal(results.every((result) => result.stateId === "runner-test"), true);
  assert.equal(results.every((result) => result.policyUsesLlm === false), true);
});

test("policy runner rejects malformed JSONL with a line number", () => {
  assert.throws(() => parseStates("{}\nnot-json\n"), /line 2/);
});

test("development split contains twelve unique boundary states", () => {
  const content = fs.readFileSync(path.join(__dirname, "..", "evaluation", "states", "dev.jsonl"), "utf8");
  const states = parseStates(content);
  assert.equal(states.length, 12);
  assert.equal(new Set(states.map((state) => state.stateId)).size, 12);
  assert.equal(states.filter((state) => state.expectedStatus === "needs_evidence").length, 2);
  assert.equal(states.filter((state) => state.comparisonGroups?.includes("same-code-different-history")).length, 2);
  assert.equal(states.filter((state) => state.comparisonGroups?.includes("irrelevant-text-invariance")).length, 2);
});

function state() {
  return {
    stateId: "runner-test",
    description: "A first reliable failure",
    studentCode: "def total(values):\n    return 0",
    taskSpec: { id: "exercise-test", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return the sum", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "failed", summary: "AssertionError", source: "assert", confidence: "high", hasReliableCheck: true },
    learnerBefore: { studentId: "simulated-dev", mastery: { accumulators: 50 } },
    history: [],
    courseContext: { exerciseId: "exercise-test", difficulty: 2, nextExercises: ["exercise-next"], nextConcepts: ["conditionals"] },
    expectedStatus: "action",
    acceptableActions: ["RETRY_WITH_SCAFFOLD"],
    forbiddenActions: ["HARDER", "NEXT_CONCEPT"]
  };
}
