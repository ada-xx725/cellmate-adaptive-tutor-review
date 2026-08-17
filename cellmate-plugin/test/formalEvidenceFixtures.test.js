const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const annotationDir = path.join(root, "evaluation", "annotation");
const evidenceDir = path.join(annotationDir, "evidence");

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
}

test("checked-in formal evidence report records a complete successful reproduction", () => {
  const checkedIn = JSON.parse(fs.readFileSync(path.join(evidenceDir, "FORMAL_EVIDENCE_RESULTS_BATCH_01.json"), "utf8"));
  assert.equal(checkedIn.fixture_count, 6);
  assert.equal(checkedIn.state_count, 12);
  assert.equal(checkedIn.all_expected_results_reproduced, true);
  assert.equal(checkedIn.policy_outputs_observed, false);
  assert.equal(checkedIn.reference_labels_present, false);
  assert.equal(checkedIn.results.every((result) => result.matches_expected), true);
});

test("every draft state is backed by exactly one matching evidence result", () => {
  const states = readJsonl(path.join(annotationDir, "formal_states_v1.draft.jsonl"));
  const fixtures = JSON.parse(fs.readFileSync(path.join(evidenceDir, "FORMAL_EVIDENCE_FIXTURES_BATCH_01.json"), "utf8"));
  const report = JSON.parse(fs.readFileSync(path.join(evidenceDir, "FORMAL_EVIDENCE_RESULTS_BATCH_01.json"), "utf8"));
  const fixtureByState = new Map();
  for (const fixture of fixtures.fixtures) {
    for (const stateId of fixture.state_ids) {
      assert.equal(fixtureByState.has(stateId), false, `duplicate fixture for ${stateId}`);
      fixtureByState.set(stateId, fixture);
    }
  }
  const resultByFixture = new Map(report.results.map((result) => [result.fixture_id, result]));
  assert.deepEqual([...fixtureByState.keys()].sort(), states.map((state) => state.state_id).sort());

  for (const state of states) {
    const fixture = fixtureByState.get(state.state_id);
    const result = resultByFixture.get(fixture.fixture_id);
    assert.ok(result, `missing result for ${fixture.fixture_id}`);
    assert.equal(result.status, state.evidence.status, state.state_id);
    assert.equal(result.passed_checks, state.evidence.test_coverage.passed_checks, state.state_id);
    assert.equal(result.total_checks, state.evidence.test_coverage.total_checks, state.state_id);
    assert.equal(result.error_signature, state.evidence.error_signature, state.state_id);
    if (fixture.execution_mode === "python") {
      assert.equal(fixture.student_code, state.student_code, state.state_id);
    }
  }
});

test("private provenance covers all states and remains separated from rater material", () => {
  const provenance = readJsonl(path.join(annotationDir, "FORMAL_EVIDENCE_PROVENANCE_BATCH_01.jsonl"));
  const covered = provenance.flatMap((record) => record.state_ids).sort();
  const expected = Array.from({ length: 12 }, (_, index) => `heldout-${String(index + 1).padStart(3, "0")}`);
  assert.deepEqual(covered, expected);
  for (const record of provenance) {
    assert.equal(record.shown_to_raters, false);
    assert.equal(record.policy_outputs_observed, false);
    assert.equal(record.reference_labels_present, false);
  }
});
