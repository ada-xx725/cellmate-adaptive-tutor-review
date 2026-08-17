const assert = require("node:assert/strict");
const test = require("node:test");
const { DecisionEngine } = require("../out/adaptive/core/decisionEngine");
const { FixedPolicy, NoHistoryPolicy, FullAdaptivePolicy } = require("../out/adaptive/core/policies");

test("all policies share the same evidence gate and state updater", () => {
  for (const policy of [new FixedPolicy(), new NoHistoryPolicy(), new FullAdaptivePolicy()]) {
    const engine = new DecisionEngine(policy);
    const result = engine.decide(input({ evidence: { status: "unavailable", summary: "warning", confidence: "low", hasReliableCheck: false } }));
    assert.equal(result.status, "needs_evidence");
    assert.deepEqual(result.learnerAfter, { studentId: "student", mastery: { for_loops: 50 } });
  }
});

test("fixed policy uses only pass or fail", () => {
  const engine = new DecisionEngine(new FixedPolicy());
  assert.equal(engine.decide(input({ evidence: failedEvidence(), history: repeatedFailureHistory() })).action, "RETRY_WITH_SCAFFOLD");
  const passed = engine.decide(input({ evidence: passedEvidence(), learnerBefore: learner(95) }));
  assert.equal(passed.action, "SIMILAR");
  assert.equal(passed.policyVersion, "fixed-v2");
  assert.deepEqual(passed.reasonCodes, ["FIXED_PASS_SIMILAR"]);
});

test("no-history policy is unchanged by learner mastery and history", () => {
  const engine = new DecisionEngine(new NoHistoryPolicy());
  const first = engine.decide(input({ evidence: passedEvidence(), learnerBefore: learner(20), history: [] }));
  const second = engine.decide(input({ evidence: passedEvidence(), learnerBefore: learner(95), history: repeatedFailureHistory() }));
  assert.equal(first.action, "SIMILAR");
  assert.equal(second.action, first.action);
});

test("full adaptive policy changes a repeated concept failure to easier", () => {
  const engine = new DecisionEngine(new FullAdaptivePolicy());
  const firstFailure = engine.decide(input({ evidence: failedEvidence(), history: [] }));
  const repeatedFailure = engine.decide(input({ evidence: failedEvidence(), history: repeatedFailureHistory() }));
  assert.equal(firstFailure.action, "RETRY_WITH_SCAFFOLD");
  assert.equal(repeatedFailure.action, "EASIER");
  assert.deepEqual(repeatedFailure.reasonCodes, ["REPEATED_TASK_OR_CONCEPT_FAILURE"]);
});

test("policy result records stable policy identity and evidence fields", () => {
  const result = new DecisionEngine(new FullAdaptivePolicy()).decide(input({ evidence: passedEvidence() }));
  assert.equal(result.policy, "full_adaptive");
  assert.equal(result.policyVersion, "full-adaptive-v1");
  assert.deepEqual(result.evidenceUsed, ["status:passed", "source:assert", "confidence:high", "reliable:true"]);
});

function input(overrides = {}) {
  return {
    taskSpec: taskSpec(),
    evidence: passedEvidence(),
    learnerBefore: learner(50),
    history: [],
    courseContext: { exerciseId: "exercise-test", difficulty: 1, nextExercises: ["exercise-next"], nextConcepts: ["conditionals"] },
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "exercise-test",
    sourceMode: "course_verified",
    taskSummary: "Use a for loop",
    expectedBehavior: "Return the total",
    title: "Loop total",
    promptMarkdown: "",
    targetConcepts: ["for_loops"],
    primaryConcept: "for_loops",
    difficulty: 1,
    confidence: 1
  };
}

function learner(score) {
  return { studentId: "student", mastery: { for_loops: score } };
}

function passedEvidence() {
  return { status: "passed", summary: "ok", source: "assert", confidence: "high", hasReliableCheck: true };
}

function failedEvidence() {
  return { status: "failed", summary: "AssertionError", source: "assert", confidence: "high", hasReliableCheck: true };
}

function repeatedFailureHistory() {
  return [{
    fingerprint: "prior",
    exerciseId: "exercise-test",
    action: "RETRY_WITH_SCAFFOLD",
    evidence: failedEvidence(),
    taskSpec: taskSpec(),
    createdAt: "2026-01-01T00:00:00.000Z"
  }];
}
