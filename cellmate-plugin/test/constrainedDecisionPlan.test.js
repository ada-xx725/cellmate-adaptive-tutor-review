const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildConstrainedDecisionFacts,
  buildConstrainedDecisionPlan
} = require("../out/adaptive/constrainedDecisionPlan");

test("keeps insufficient evidence outside every teaching action", () => {
  const plan = buildConstrainedDecisionPlan(input({
    evidence: evidence("not_run", { hasReliableCheck: false })
  }));
  assert.equal(plan.status, "needs_evidence");
  assert.deepEqual(plan.allowedActions, []);
});

test("allows a hint or scaffold for a first reliable failure with a safe scaffold default", () => {
  const plan = buildConstrainedDecisionPlan(input({ evidence: evidence("failed") }));
  assert.equal(plan.status, "action");
  assert.deepEqual(plan.allowedActions, ["HINT", "RETRY_WITH_SCAFFOLD"]);
  assert.equal(plan.defaultAction, "RETRY_WITH_SCAFFOLD");
});

test("escalates a failed hint to scaffold and a failed scaffold to easier", () => {
  const afterHint = buildConstrainedDecisionPlan(input({
    evidence: evidence("failed"),
    history: [attempt("HINT", "failed")]
  }));
  const afterScaffold = buildConstrainedDecisionPlan(input({
    evidence: evidence("failed"),
    history: [attempt("RETRY_WITH_SCAFFOLD", "failed")]
  }));
  assert.deepEqual(afterHint.allowedActions, ["RETRY_WITH_SCAFFOLD"]);
  assert.equal(afterHint.defaultAction, "RETRY_WITH_SCAFFOLD");
  assert.deepEqual(afterScaffold.allowedActions, ["EASIER"]);
  assert.equal(afterScaffold.defaultAction, "EASIER");
});

test("prevents progression when passed evidence has narrow positive coverage", () => {
  const plan = buildConstrainedDecisionPlan(input({
    evidence: evidence("passed", {
      coverage: {
        scope: "narrow",
        passedChecks: 1,
        totalChecks: 1,
        notCovered: ["empty input", "boundary values"]
      }
    }),
    learnerBefore: learner(92),
    history: [attempt("SIMILAR", "passed", "2026-01-01"), attempt("SIMILAR", "passed", "2026-01-02")]
  }));
  assert.deepEqual(plan.allowedActions, ["SIMILAR"]);
  assert.equal(plan.defaultAction, "SIMILAR");
});

test("uses mastery bands for broad or unknown positive coverage", () => {
  const developing = buildConstrainedDecisionPlan(input({ learnerBefore: learner(60) }));
  const solid = buildConstrainedDecisionPlan(input({ learnerBefore: learner(76) }));
  assert.deepEqual(developing.allowedActions, ["SIMILAR"]);
  assert.deepEqual(solid.allowedActions, ["SIMILAR", "HARDER"]);
  assert.equal(solid.defaultAction, "HARDER");
});

test("permits next concept only after stable success with a recorded course target", () => {
  const history = [
    attempt("SIMILAR", "passed", "2026-01-01"),
    attempt("HARDER", "passed", "2026-01-02")
  ];
  const withTarget = buildConstrainedDecisionPlan(input({ learnerBefore: learner(90), history }));
  const withoutTarget = buildConstrainedDecisionPlan(input({
    learnerBefore: learner(90),
    history,
    courseContext: { exerciseId: "exercise-test", nextConcepts: [] }
  }));
  assert.deepEqual(withTarget.allowedActions, ["NEXT_CONCEPT"]);
  assert.deepEqual(withoutTarget.allowedActions, ["HARDER"]);
});

test("requires stable success before advancing even when mastery and course context are ready", () => {
  const plan = buildConstrainedDecisionPlan(input({
    learnerBefore: learner(90),
    history: [attempt("SIMILAR", "passed")]
  }));
  assert.deepEqual(plan.allowedActions, ["HARDER"]);
});

test("canonical facts are invariant to concept aliases and history input order", () => {
  const older = attempt("SIMILAR", "passed", "2026-01-01", "older");
  const newer = attempt("HARDER", "passed", "2026-01-02", "newer");
  const first = buildConstrainedDecisionFacts(input({ history: [older, newer] }));
  const second = buildConstrainedDecisionFacts(input({
    taskSpec: { ...taskSpec(), targetConcepts: ["accumulator", "loops"] },
    history: [newer, older]
  }));
  assert.deepEqual(first, second);
  assert.deepEqual(first.targetConcepts, ["accumulators", "for_loops"]);
  assert.equal(first.stableSuccessStreak, 2);
});

function input(overrides = {}) {
  return {
    taskSpec: taskSpec(),
    evidence: evidence("passed"),
    learnerBefore: learner(58),
    history: [],
    courseContext: {
      exerciseId: "exercise-test",
      nextExercises: ["exercise-next"],
      nextConcepts: ["conditionals"]
    },
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "exercise-test",
    sourceMode: "course_verified",
    taskSummary: "Use a loop to calculate a running total.",
    expectedBehavior: "Return the total.",
    title: "Loop total",
    promptMarkdown: "",
    targetConcepts: ["for_loops", "accumulators"],
    primaryConcept: "for_loops",
    difficulty: 1,
    confidence: 1
  };
}

function learner(score) {
  return { studentId: "student", mastery: { for_loops: score, accumulators: score } };
}

function evidence(status, overrides = {}) {
  return {
    status,
    summary: `${status} explicit check`,
    source: "assert",
    confidence: "high",
    hasReliableCheck: status === "passed" || status === "failed",
    ...overrides
  };
}

function attempt(action, status, date = "2026-01-01", fingerprint = `${action}-${date}`) {
  return {
    participantId: "student",
    fingerprint,
    exerciseId: "exercise-test",
    action,
    evidence: evidence(status),
    taskSpec: taskSpec(),
    createdAt: `${date}T00:00:00.000Z`
  };
}
