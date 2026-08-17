const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { readJsonl, validateFormalStatePack } = require("../evaluation/annotation/validateFormalStatePack");

const draftPath = path.join(__dirname, "..", "evaluation", "annotation", "formal_states_v1.draft.jsonl");

test("first formal draft batch is blinded, balanced, and counterfactually paired", () => {
  const states = readJsonl(draftPath);
  const result = validateFormalStatePack(states);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.equal(result.stateCount, 12);
  assert.deepEqual(result.strata, {
    first_failure: 2,
    repeated_failure: 2,
    developing_pass: 2,
    established_pass: 2,
    needs_evidence: 2,
    narrow_pass: 2
  });
  assert.deepEqual(result.sources, { course_verified: 8, generated_attempt: 2, generic_llm: 2 });
  assert.equal(result.counterfactualPairCount, 6);
  assert.deepEqual(states.map((state) => state.state_id), [
    "heldout-001", "heldout-002", "heldout-003", "heldout-004",
    "heldout-005", "heldout-006", "heldout-007", "heldout-008",
    "heldout-009", "heldout-010", "heldout-011", "heldout-012"
  ]);
});

test("draft batch manifest pins the exact canonical content", () => {
  const manifestPath = path.join(__dirname, "..", "evaluation", "annotation", "FORMAL_DRAFT_BATCH_01.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const canonical = fs.readFileSync(draftPath, "utf8").replace(/\r\n/g, "\n");
  const hash = require("node:crypto").createHash("sha256").update(canonical, "utf8").digest("hex").toUpperCase();
  assert.equal(manifest.sha256, hash);
  assert.equal(manifest.stateCount, 12);
  assert.equal(manifest.policyOutputsObserved, false);
  assert.equal(manifest.referenceLabelsPresent, false);
});
