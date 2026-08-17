const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  MANIFEST_PATH,
  STATE_PATH,
  buildActionQualityStatePackV2,
  verifyCommittedPack
} = require("../evaluation/annotation/buildActionQualityStatePackV2");
const { validateFormalStatePack } = require("../evaluation/annotation/validateFormalStatePack");

const pluginRoot = path.resolve(__dirname, "..");

test("committed v2 state pack is reproducible, complete, and newly identified", () => {
  const verified = verifyCommittedPack();
  const validation = validateFormalStatePack(verified.states, { final: true });

  assert.equal(validation.valid, true, validation.errors.join("\n"));
  assert.equal(validation.stateCount, 60);
  assert.deepEqual(validation.strata, {
    first_failure: 10,
    repeated_failure: 12,
    developing_pass: 10,
    established_pass: 10,
    needs_evidence: 8,
    narrow_pass: 10
  });
  assert.deepEqual(validation.sources, {
    course_verified: 40,
    generated_attempt: 10,
    generic_llm: 10
  });
  assert.equal(validation.counterfactualPairCount, 30);
  assert.deepEqual(
    verified.states.map((state) => state.state_id),
    Array.from({ length: 60 }, (_, index) => `heldout-v2-${String(index + 1).padStart(3, "0")}`)
  );
  assert.equal(new Set(verified.states.map((state) => state.counterfactual_pair_id)).size, 30);
  assert.equal(verified.states.every((state) => state.counterfactual_pair_id.startsWith("cf-v2-")), true);

  const rebuilt = buildActionQualityStatePackV2();
  assert.equal(rebuilt.jsonl, fs.readFileSync(STATE_PATH, "utf8"));
  assert.deepEqual(rebuilt.manifest, JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")));
});

test("v2 replaces the complete exposed cluster without changing course coverage quotas", () => {
  const { states, manifest } = verifyCommittedPack();
  const text = fs.readFileSync(STATE_PATH, "utf8");
  const replacements = states.filter(
    (state) => state.evidence.error_signature === "accumulator_counts_items_instead_of_values"
  );
  const evaluationSet = JSON.parse(
    fs.readFileSync(path.join(pluginRoot, "resources", "evaluation_set.json"), "utf8")
  );

  assert.equal(text.includes("accumulator_overwritten"), false);
  assert.equal(replacements.length, 4);
  assert.equal(replacements.every((state) => state.student_code.includes("total += 1")), true);
  assert.equal(replacements.every((state) => state.task.id === "exercise-1_15"), true);
  assert.deepEqual(manifest.courseLectures, [1, 2, 3, 4, 5]);
  assert.deepEqual(manifest.courseExercises, evaluationSet.exercises.map((entry) => entry.id).sort());
  assert.equal(manifest.invarianceGroupCount, 22);
  assert.equal(manifest.invarianceGroups.length, 22);
  assert.equal(manifest.invarianceGroups.every((group) =>
    group.groupId.startsWith("inv-v2-")
      && group.stateIds.every((stateId) => stateId.startsWith("heldout-v2-"))
  ), true);
});

test("v2 state artifacts remain blinded and contain no policy outputs or reference labels", () => {
  const { manifest } = verifyCommittedPack();
  const text = fs.readFileSync(STATE_PATH, "utf8").toLowerCase();
  for (const token of [
    "acceptable_action",
    "reference_action",
    "selected_action",
    "policy_identity",
    "fixed_baseline",
    "full_adaptive",
    "llm_selected",
    "judge_score"
  ]) {
    assert.equal(text.includes(token), false, `found forbidden token: ${token}`);
  }
  assert.equal(manifest.statePackVersion, "action-quality-states-v2");
  assert.equal(manifest.protocolVersion, "action-quality-protocol-v2");
  assert.equal(manifest.supersedesStatePackVersion, "action-quality-states-v1");
  assert.equal(manifest.policyOutputsObserved, false);
  assert.equal(manifest.referenceLabelsPresent, false);
  assert.equal(manifest.formalResultsPresent, false);
});
