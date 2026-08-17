const assert = require("node:assert/strict");
const test = require("node:test");
const { decideAdaptiveAction, updateMastery } = require("../out/adaptive/policy");

const learner = { studentId: "test", mastery: { loops: 50 } };

test("unrun course checks request evidence instead of a teaching hint", () => {
  const decision = decideAdaptiveAction({ evidence: { status: "not_run", summary: "" }, attempts: 0, learner, concepts: ["loops"] });
  assert.equal(decision.status, "needs_evidence");
  assert.deepEqual(decision.reasonCodes, ["CHECK_NOT_RUN"]);
  assert.equal("action" in decision, false);
});

test("unrecognised low-confidence output requests evidence", () => {
  const decision = decideAdaptiveAction({ evidence: { status: "unavailable", summary: "", confidence: "low" }, attempts: 0, learner, concepts: ["loops"] });
  assert.equal(decision.status, "needs_evidence");
  assert.deepEqual(decision.reasonCodes, ["EVIDENCE_UNAVAILABLE", "LOW_CONFIDENCE_EVIDENCE"]);
});

test("repeated failed attempts receive an easier exercise", () => {
  assert.equal(actionFor({ evidence: { status: "failed", summary: "AssertionError" }, attempts: 2, learner, concepts: ["loops"] }), "EASIER");
});

test("passed work with moderate mastery receives a similar exercise", () => {
  assert.equal(actionFor({ evidence: { status: "passed", summary: "" }, attempts: 1, learner, concepts: ["loops"] }), "SIMILAR");
});

test("passed work with solid mastery receives a harder exercise", () => {
  const solidLearner = { studentId: "test", mastery: { loops: 75 } };
  assert.equal(actionFor({ evidence: { status: "passed", summary: "" }, attempts: 1, learner: solidLearner, concepts: ["loops"] }), "HARDER");
});

test("repeated high-mastery passes move to the next concept", () => {
  const strongLearner = { studentId: "test", mastery: { loops: 85 } };
  assert.equal(actionFor({ evidence: { status: "passed", summary: "" }, attempts: 2, learner: strongLearner, concepts: ["loops"] }), "NEXT_CONCEPT");
});

test("concept success streak upgrades passed work", () => {
  assert.equal(actionFor({
    evidence: { status: "passed", summary: "", confidence: "high" },
    attempts: 0,
    learner,
    concepts: ["for_loops", "accumulators"],
    conceptSuccessStreak: 1
  }), "HARDER");
  assert.equal(actionFor({
    evidence: { status: "passed", summary: "", confidence: "high" },
    attempts: 0,
    learner,
    concepts: ["for_loops", "accumulators"],
    conceptSuccessStreak: 2
  }), "NEXT_CONCEPT");
});

test("mastery updates are bounded", () => {
  const passed = updateMastery({ studentId: "test", mastery: { loops: 98 } }, ["loops"], { status: "passed", summary: "" });
  const failed = updateMastery({ studentId: "test", mastery: { loops: 3 } }, ["loops"], { status: "failed", summary: "" });
  assert.equal(passed.mastery.for_loops, 100);
  assert.equal(failed.mastery.for_loops, 0);
  assert.equal("loops" in passed.mastery, false);
});

test("unavailable evidence leaves mastery unchanged", () => {
  const before = { studentId: "test", mastery: { for_loops: 62 } };
  const after = updateMastery(before, ["for_loops"], { status: "unavailable", summary: "unknown", confidence: "low", hasReliableCheck: false });
  assert.deepEqual(after, before);
});

function actionFor(input) {
  const decision = decideAdaptiveAction(input);
  assert.equal(decision.status, "action");
  return decision.action;
}
