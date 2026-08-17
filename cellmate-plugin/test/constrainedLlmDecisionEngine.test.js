const assert = require("node:assert/strict");
const test = require("node:test");
const {
  actionIsAllowedByV7,
  ConstrainedLlmDecisionEngine
} = require("../out/adaptive/core/constrainedLlmDecisionEngine");

test("returns a valid selected action with the v7 policy boundary", async () => {
  const engine = new ConstrainedLlmDecisionEngine(selector({
    action: "HARDER",
    reason: "Broad evidence and solid mastery support one additional challenge.",
    evidenceReferences: ["check:current", "mastery:for_loops"],
    confidence: 0.8
  }));
  const result = await engine.decide(input({ learnerBefore: learner(76) }));
  assert.equal(result.action, "HARDER");
  assert.equal(result.policyVersion, "llm-next-step-v7");
  assert.equal(result.fallbackUsed, false);
  assert.deepEqual(result.reasonCodes, ["LLM_SELECTED", "V7_MASTERY_70_TO_84"]);
});

test("uses the constrained default when the selector is unavailable", async () => {
  const noCourseTarget = input({
    learnerBefore: learner(90),
    history: successfulHistory(),
    courseContext: { exerciseId: "exercise-test", nextConcepts: [] }
  });
  const engine = new ConstrainedLlmDecisionEngine(selector(undefined));
  const result = await engine.decide(noCourseTarget);
  assert.equal(result.action, "HARDER");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackPolicyVersion, "constrained-plan-v1");
  assert.equal(actionIsAllowedByV7(noCourseTarget, result.action), true);
});

test("defends against a selector implementation that returns an action outside the mask", async () => {
  const narrow = input({
    learnerBefore: learner(90),
    evidence: passedEvidence({ coverage: { scope: "narrow", notCovered: ["empty input"] } })
  });
  const engine = new ConstrainedLlmDecisionEngine(selector({
    action: "NEXT_CONCEPT",
    reason: "Invalid injected selection.",
    evidenceReferences: ["check:current"],
    confidence: 1
  }));
  const result = await engine.decide(narrow);
  assert.equal(result.action, "SIMILAR");
  assert.equal(result.fallbackUsed, true);
  assert.equal(actionIsAllowedByV7(narrow, result.action), true);
});

test("keeps the evidence gate deterministic without calling the selector", async () => {
  let calls = 0;
  const engine = new ConstrainedLlmDecisionEngine({ select: async () => { calls += 1; } });
  const learnerBefore = learner(50);
  const result = await engine.decide(input({
    learnerBefore,
    evidence: { status: "unavailable", summary: "No reliable check", source: "none", confidence: "low", hasReliableCheck: false }
  }));
  assert.equal(result.status, "needs_evidence");
  assert.equal(calls, 0);
  assert.deepEqual(result.learnerAfter, learnerBefore);
});

function selector(value) {
  return { select: async () => value };
}

function input(overrides = {}) {
  return {
    taskSpec: taskSpec(),
    evidence: passedEvidence(),
    learnerBefore: learner(58),
    history: [],
    courseContext: { exerciseId: "exercise-test", nextConcepts: ["conditionals"] },
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "exercise-test",
    sourceMode: "course_verified",
    taskSummary: "Use a loop.",
    expectedBehavior: "Return the total.",
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

function passedEvidence(overrides = {}) {
  return { status: "passed", summary: "All checks passed.", source: "assert", confidence: "high", hasReliableCheck: true, ...overrides };
}

function successfulHistory() {
  return [
    attempt("SIMILAR", "2026-01-01", "pass-1"),
    attempt("HARDER", "2026-01-02", "pass-2")
  ];
}

function attempt(action, date, fingerprint) {
  return {
    participantId: "student",
    fingerprint,
    exerciseId: "exercise-test",
    action,
    evidence: passedEvidence(),
    taskSpec: taskSpec(),
    createdAt: `${date}T00:00:00.000Z`
  };
}
