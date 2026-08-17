const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  MANIFEST_PATH,
  STATE_PATH,
  buildActionQualityStatePack,
  verifyCommittedPack
} = require("../evaluation/annotation/buildActionQualityStatePack");
const { validateFormalStatePack } = require("../evaluation/annotation/validateFormalStatePack");

const pluginRoot = path.resolve(__dirname, "..");

test("committed action-quality state pack is reproducible and passes final quotas", () => {
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

  const rebuilt = buildActionQualityStatePack();
  assert.equal(rebuilt.jsonl, fs.readFileSync(STATE_PATH, "utf8"));
  assert.deepEqual(rebuilt.manifest, JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")));
});

test("manifest pins course coverage, generator, and non-result status", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const evaluationSet = JSON.parse(fs.readFileSync(path.join(pluginRoot, "resources", "evaluation_set.json"), "utf8"));
  const metadata = JSON.parse(fs.readFileSync(path.join(pluginRoot, "resources", "expert_course_metadata.json"), "utf8"));

  assert.equal(manifest.statePackVersion, "action-quality-states-v1");
  assert.equal(manifest.protocolVersion, "action-quality-protocol-v1");
  assert.equal(manifest.courseCommit, metadata.courseCommit);
  assert.deepEqual(manifest.courseLectures, [1, 2, 3, 4, 5]);
  assert.deepEqual(manifest.evaluationSetExercises, evaluationSet.exercises.map((entry) => entry.id).sort());
  assert.deepEqual(manifest.courseExercises, manifest.evaluationSetExercises);
  assert.equal(manifest.invarianceGroupCount, 22);
  assert.equal(manifest.constructedData, true);
  assert.equal(manifest.policyOutputsObserved, false);
  assert.equal(manifest.referenceLabelsPresent, false);
  assert.equal(manifest.formalResultsPresent, false);
  assert.match(manifest.sha256, /^[A-F0-9]{64}$/);
  assert.match(manifest.generatorSha256, /^[A-F0-9]{64}$/);
});

test("invariance groups change wording without changing decision-relevant facts", () => {
  const { states, manifest } = verifyCommittedPack();
  const byId = new Map(states.map((state) => [state.state_id, state]));

  for (const group of manifest.invarianceGroups) {
    assert.equal(group.relation, "meaning_preserving_rewording");
    assert.equal(group.stateIds.length, 2);
    const [first, second] = group.stateIds.map((id) => byId.get(id));
    assert.ok(first && second, `${group.groupId} references a missing state`);
    assert.notEqual(first.task.task_summary, second.task.task_summary);
    assert.notEqual(first.task.expected_behavior, second.task.expected_behavior);
    assert.notEqual(first.evidence.summary, second.evidence.summary);
    assert.deepEqual(decisionFacts(first), decisionFacts(second));
  }
});

test("state pack does not contain policy identities, outputs, or reference labels", () => {
  const text = fs.readFileSync(STATE_PATH, "utf8");
  const forbidden = [
    "acceptable_action",
    "reference_action",
    "selected_action",
    "policy_identity",
    "fixed_baseline",
    "full_adaptive",
    "llm_selected",
    "judge_score"
  ];

  for (const token of forbidden) {
    assert.equal(text.toLowerCase().includes(token), false, `found forbidden token: ${token}`);
  }
});

function decisionFacts(state) {
  return {
    stratum: state.stratum,
    source_mode: state.source_mode,
    student_code: state.student_code,
    task: {
      id: state.task.id,
      primary_concept: state.task.primary_concept,
      target_concepts: state.task.target_concepts,
      difficulty: state.task.difficulty
    },
    evidence: {
      status: state.evidence.status,
      source: state.evidence.source,
      confidence: state.evidence.confidence,
      has_reliable_check: state.evidence.has_reliable_check,
      error_signature: state.evidence.error_signature,
      test_coverage: {
        passed_checks: state.evidence.test_coverage.passed_checks,
        total_checks: state.evidence.test_coverage.total_checks,
        categories: state.evidence.test_coverage.categories,
        not_covered: state.evidence.test_coverage.not_covered
      }
    },
    learner_before: state.learner_before,
    history: state.history,
    course_context: state.course_context
  };
}
