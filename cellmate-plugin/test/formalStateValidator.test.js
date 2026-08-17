const assert = require("node:assert/strict");
const test = require("node:test");

const { validateFormalStatePack } = require("../evaluation/annotation/validateFormalStatePack");

test("accepts a blinded draft counterfactual pair", () => {
  const first = makeState("heldout-001", "first_failure");
  const repeated = makeState("heldout-002", "repeated_failure");
  first.counterfactual_pair_id = "pair-001";
  repeated.counterfactual_pair_id = "pair-001";
  repeated.history = [{
    attempt_index: 1,
    evidence_status: "failed",
    support_received: { type: "hint", summary: "Review the running total update." },
    support_outcome: "same_error_repeated"
  }];
  const result = validateFormalStatePack([first, repeated]);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.counterfactualPairCount, 1);
});

test("rejects policy and human-reference label leakage at any depth", () => {
  const state = makeState("heldout-001", "first_failure");
  state.metadata = { acceptableActions: ["HINT"] };
  const result = validateFormalStatePack([state]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /acceptableActions/);
});

test("rejects a counterfactual pair that changes current evidence", () => {
  const first = makeState("heldout-001", "developing_pass");
  const second = makeState("heldout-002", "established_pass");
  first.counterfactual_pair_id = "pair-001";
  second.counterfactual_pair_id = "pair-001";
  second.evidence.summary = "A different test result";
  const result = validateFormalStatePack([first, second]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /differ outside learner_before/);
});

test("final mode enforces frozen state, source, pair, and lecture quotas", () => {
  const result = validateFormalStatePack([makeState("heldout-001", "first_failure")], { final: true });
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /expected 60 states/);
  assert.match(result.errors.join("\n"), /source course_verified expected 40/);
  assert.match(result.errors.join("\n"), /at least 12 complete counterfactual pairs/);
  assert.match(result.errors.join("\n"), /course lecture 2 is not represented/);
});

function makeState(stateId, stratum) {
  const passed = ["developing_pass", "established_pass", "narrow_pass"].includes(stratum);
  return {
    schema_version: 1,
    annotation_guide_version: "annotation-guide-v1",
    state_pack_version: "formal-heldout-v1-draft",
    state_id: stateId,
    stratum,
    source_mode: "course_verified",
    task: {
      id: "exercise-1_15",
      title: "Sum values",
      task_summary: "Return the sum of the list values.",
      expected_behavior: "Return one number equal to the sum of every input element.",
      primary_concept: "accumulators",
      target_concepts: ["for_loops", "accumulators", "lists"],
      difficulty: 2
    },
    student_code: "def sum_values(values):\n    return 0\n",
    evidence: {
      status: passed ? "passed" : "failed",
      summary: passed ? "All checks passed." : "Non-empty inputs returned zero.",
      source: "hidden_tests",
      confidence: "high",
      has_reliable_check: true,
      error_signature: passed ? null : "accumulator_not_updated",
      test_coverage: {
        summary: "Normal, empty, and negative cases were checked.",
        passed_checks: passed ? 5 : 1,
        total_checks: 5,
        categories: ["normal", "empty", "negative"]
      }
    },
    learner_before: {
      scale_note: "50 is the initial/default level; higher values indicate stronger recent evidence.",
      concepts: {
        for_loops: { score: 50, band: "developing" },
        accumulators: { score: 48, band: "developing" },
        lists: { score: 52, band: "developing" }
      }
    },
    history: [],
    course_context: { lecture: 1, next_exercises: ["exercise-1_17"], next_concepts: ["nested_lists"] }
  };
}
