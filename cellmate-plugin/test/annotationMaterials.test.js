const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const annotationDir = path.join(__dirname, "..", "evaluation", "annotation");
const crypto = require("node:crypto");

test("pilot annotation set contains six unique blinded states", () => {
  const states = fs.readFileSync(path.join(annotationDir, "pilot_states.jsonl"), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(states.length, 6);
  assert.equal(new Set(states.map((state) => state.state_id)).size, 6);
  assert.deepEqual(states.map((state) => state.state_id), [
    "pilot-A01", "pilot-A02", "pilot-A03", "pilot-A04", "pilot-A05", "pilot-A06"
  ]);

  for (const state of states) {
    assert.equal(state.schema_version, 1);
    assert.equal(state.pilot_only, true);
    assert.ok(state.task?.id);
    assert.ok(state.student_code);
    assert.ok(state.evidence?.status);
    assert.ok(state.learner_before);
    assert.ok(Array.isArray(state.history));
    assert.equal(containsForbiddenField(state), false);
  }

  assert.ok(states.some((state) => state.evidence.status === "not_run"));
  assert.ok(states.some((state) => state.evidence.status === "failed" && state.history.length === 0));
  assert.ok(states.some((state) => state.evidence.status === "failed" && state.history.length > 0));
  assert.ok(states.some((state) => state.evidence.status === "passed" && state.history.length > 0));
});

test("pilot guide and form use the same decision vocabulary", () => {
  const guide = fs.readFileSync(path.join(annotationDir, "ANNOTATION_GUIDE.md"), "utf8");
  const form = fs.readFileSync(path.join(annotationDir, "PILOT_RATER_FORM.md"), "utf8");
  for (const value of ["NEEDS_EVIDENCE", "HINT", "RETRY_WITH_SCAFFOLD", "EASIER", "SIMILAR", "HARDER", "NEXT_CONCEPT"]) {
    assert.match(guide, new RegExp(`\\b${value}\\b`));
    assert.match(form, new RegExp(`\\b${value}\\b`));
  }
  assert.match(guide, /must not be included in the formal held-out evaluation/i);
});

test("pilot v1 adjudication preserves the reviewed state-pack identity", () => {
  const hash = canonicalTextHash(path.join(annotationDir, "pilot_states.jsonl"));
  const adjudication = fs.readFileSync(path.join(annotationDir, "PILOT_ADJUDICATION.md"), "utf8");
  assert.equal(hash, "61294F0CDCF9B06F5EA4D4E355946E6159662175EF03642D253390E5890531B0");
  assert.match(adjudication, new RegExp(hash));
  assert.match(adjudication, /diagnostic pilot only; not formal held-out labels/i);
});

test("guide v2 defines tri-state actions and missing-support safeguards", () => {
  const guide = fs.readFileSync(path.join(annotationDir, "ANNOTATION_GUIDE_V2.md"), "utf8");
  for (const rating of ["ACCEPTABLE", "SUBOPTIMAL", "FORBIDDEN", "NOT_PERMITTED"]) {
    assert.match(guide, new RegExp(`\\b${rating}\\b`));
  }
  assert.match(guide, /least intensive acceptable action/i);
  assert.match(guide, /Do not infer previous support/i);
  assert.match(guide, /test_coverage/);
  assert.match(guide, /50.*initial\/default/i);
});

test("pilot v2 contains eight versioned blinded states with required context", () => {
  const states = readJsonl("pilot_states_v2.jsonl");
  assert.equal(states.length, 8);
  assert.deepEqual(states.map((state) => state.state_id), [
    "pilot-B01", "pilot-B02", "pilot-B03", "pilot-B04",
    "pilot-B05", "pilot-B06", "pilot-B07", "pilot-B08"
  ]);
  for (const state of states) {
    assert.equal(state.schema_version, 2);
    assert.equal(state.state_pack_version, "pilot-state-pack-v2");
    assert.equal(state.guide_version, "pilot-guide-v2");
    assert.equal(state.pilot_only, true);
    assert.equal(state.formal_heldout_eligible, false);
    assert.ok(state.evidence?.test_coverage?.summary);
    assert.ok(state.learner_before?.scale_note);
    for (const concept of Object.values(state.learner_before.concepts)) {
      assert.equal(typeof concept.score, "number");
      assert.ok(["emerging", "developing", "established"].includes(concept.band));
    }
    for (const attempt of state.history) {
      assert.ok(attempt.support_received);
      assert.ok(attempt.support_outcome);
    }
    assert.equal(containsForbiddenField(state), false);
  }
  assert.deepEqual(withoutHistory(states[1]), withoutHistory(states[2]));
  assert.deepEqual(withoutLearner(states[4]), withoutLearner(states[5]));
});

test("pilot v2 manifest and rater form pin the exact state-pack hash", () => {
  const hash = canonicalTextHash(path.join(annotationDir, "pilot_states_v2.jsonl"));
  const manifest = JSON.parse(fs.readFileSync(path.join(annotationDir, "PILOT_STATE_PACK_V2.json"), "utf8"));
  const forms = [
    fs.readFileSync(path.join(annotationDir, "PILOT_RATER_FORM_V2_R1.md"), "utf8"),
    fs.readFileSync(path.join(annotationDir, "PILOT_RATER_FORM_V2_R2.md"), "utf8")
  ];
  assert.equal(manifest.sha256, hash);
  assert.equal(manifest.stateCount, 8);
  assert.equal(manifest.formalHeldoutEligible, false);
  for (const form of forms) {
    assert.match(form, new RegExp(hash));
    for (const stateId of ["pilot-B01", "pilot-B02", "pilot-B03", "pilot-B04", "pilot-B05", "pilot-B06", "pilot-B07", "pilot-B08"]) {
      assert.match(form, new RegExp(stateId));
    }
  }
});

test("pilot response records and v2 adjudication are content-addressed", () => {
  const records = {
    "PILOT_RATER_FORM_R1.md": "145B22BC37665DC81AE2DA6541BCFB8F0040D1EE36CDB881C44849BA7302B7BD",
    "PILOT_RATER_FORM_R2.md": "FD5C61EFA54AD91E0F179AF8A750492A28D1F4AE07BA4A583B4FE6AC0B2CA953",
    "PILOT_RATER_FORM_V2_R1.md": "1273290D5821C610EE948A74EF94C64AF274CD49FB8182A2F8F4029DBB4EF1C4",
    "PILOT_RATER_FORM_V2_R2.md": "94551449862D602B26BDEC2381C5825F95C8D7FF581D092D0D7C6DB67E394937"
  };
  for (const [fileName, expectedHash] of Object.entries(records)) {
    assert.equal(canonicalTextHash(path.join(annotationDir, fileName)), expectedHash);
  }
  const adjudication = fs.readFileSync(path.join(annotationDir, "PILOT_V2_ADJUDICATION.md"), "utf8");
  assert.match(adjudication, /Primary Cohen's kappa.*0\.846/i);
  assert.match(adjudication, /Forbidden-set mean Jaccard.*0\.310/i);
  assert.match(adjudication, /not formal held-out labels/i);
  for (const expectedHash of Object.values(records).slice(2)) {
    assert.match(adjudication, new RegExp(expectedHash));
  }
});

test("guide v3 narrows forbidden actions and fixes the support escalation order", () => {
  const guide = fs.readFileSync(path.join(annotationDir, "ANNOTATION_GUIDE_V3.md"), "utf8");
  assert.match(guide, /critical teaching error/i);
  assert.match(guide, /Mere inefficiency.*SUBOPTIMAL/i);
  assert.match(guide, /Same failure after a targeted `HINT`[\s\S]*`RETRY_WITH_SCAFFOLD`/i);
  assert.match(guide, /Same failure after a relevant scaffold[\s\S]*`EASIER`/i);
  assert.match(guide, /Do not assume an untested edge case failed/i);
});

test("pilot v3 contains six blinded boundary states for escalation and critical errors", () => {
  const states = readJsonl("pilot_states_v3.jsonl");
  assert.deepEqual(states.map((state) => state.state_id), [
    "pilot-C01", "pilot-C02", "pilot-C03", "pilot-C04", "pilot-C05", "pilot-C06"
  ]);
  for (const state of states) {
    assert.equal(state.schema_version, 3);
    assert.equal(state.state_pack_version, "pilot-state-pack-v3");
    assert.equal(state.guide_version, "pilot-guide-v3");
    assert.equal(state.pilot_only, true);
    assert.equal(state.formal_heldout_eligible, false);
    assert.ok(state.evidence?.test_coverage?.summary);
    assert.ok(state.learner_before?.scale_note);
    assert.equal(containsForbiddenField(state), false);
    for (const attempt of state.history) {
      assert.ok(attempt.support_received);
      assert.ok(attempt.support_outcome);
    }
  }
  assert.deepEqual(withoutHistory(states[0]), withoutHistory(states[1]));
  assert.deepEqual(withoutHistory(states[0]), withoutHistory(states[2]));
  assert.deepEqual(withoutLearnerAndHistory(states[3]), withoutLearnerAndHistory(states[4]));
  assert.equal(states[5].evidence.test_coverage.total_checks, 1);
});

test("pilot v3 manifest and rater form pin the canonical state-pack hash", () => {
  const hash = canonicalTextHash(path.join(annotationDir, "pilot_states_v3.jsonl"));
  const manifest = JSON.parse(fs.readFileSync(path.join(annotationDir, "PILOT_STATE_PACK_V3.json"), "utf8"));
  const forms = [
    fs.readFileSync(path.join(annotationDir, "PILOT_RATER_FORM_V3_R1.md"), "utf8"),
    fs.readFileSync(path.join(annotationDir, "PILOT_RATER_FORM_V3_R2.md"), "utf8")
  ];
  assert.equal(manifest.sha256, hash);
  assert.equal(manifest.stateCount, 6);
  assert.equal(manifest.guideVersion, "pilot-guide-v3");
  assert.equal(manifest.formalHeldoutEligible, false);
  for (const form of forms) {
    assert.match(form, new RegExp(hash));
    for (const stateId of ["pilot-C01", "pilot-C02", "pilot-C03", "pilot-C04", "pilot-C05", "pilot-C06"]) {
      assert.match(form, new RegExp(stateId));
    }
  }
});

test("pilot v3 response records meet the frozen annotation-readiness criteria", () => {
  const records = {
    "PILOT_RATER_FORM_V3_R1.md": "12B73D5DEB110A59912999FCABBB4A36026A60D74C80694A9448A98EE587E624",
    "PILOT_RATER_FORM_V3_R2.md": "B601DDB7531824B739FEDF43D990963137406EFE41147ED130809B01DAFD116A"
  };
  for (const [fileName, expectedHash] of Object.entries(records)) {
    assert.equal(canonicalTextHash(path.join(annotationDir, fileName)), expectedHash);
  }
  const adjudication = fs.readFileSync(path.join(annotationDir, "PILOT_V3_ADJUDICATION.md"), "utf8");
  assert.match(adjudication, /Primary Cohen's kappa.*1\.000/i);
  assert.match(adjudication, /Acceptable-set mean Jaccard.*0\.917/i);
  assert.match(adjudication, /Forbidden-set mean Jaccard.*0\.889/i);
  assert.match(adjudication, /met every pre-specified annotation-readiness threshold/i);
  for (const expectedHash of Object.values(records)) {
    assert.match(adjudication, new RegExp(expectedHash));
  }
});

test("formal annotation guide preserves the adjudicated v3 decision semantics", () => {
  const guide = fs.readFileSync(path.join(annotationDir, "FORMAL_ANNOTATION_GUIDE_V1.md"), "utf8");
  assert.match(guide, /Guide version: `annotation-guide-v1`/);
  assert.match(guide, /critical teaching error/i);
  assert.match(guide, /Mere inefficiency.*SUBOPTIMAL/i);
  assert.match(guide, /Same failure after a targeted `HINT`[\s\S]*`RETRY_WITH_SCAFFOLD`/i);
  assert.match(guide, /Same failure after a relevant scaffold[\s\S]*`EASIER`/i);
  assert.match(guide, /Do not assume an untested edge case failed/i);
  assert.match(guide, /must not see policy names/i);
});

test("formal state authoring protocol freezes the blinded 60-state and 24-state design", () => {
  const protocol = fs.readFileSync(path.join(annotationDir, "FORMAL_STATE_AUTHORING_PROTOCOL_V1.md"), "utf8");
  assert.match(protocol, /Create 60 held-out/i);
  assert.match(protocol, /select 24 states/i);
  assert.match(protocol, /four states from each of the six strata/i);
  assert.match(protocol, /must not be copied or paraphrased/i);
  assert.match(protocol, /without running `FixedPolicy`, `NoHistoryPolicy`, or `FullAdaptivePolicy`/i);
  assert.match(protocol, /at least 12 counterfactual pairs/i);
});

test("formal state schema and rater template exclude policy and reference labels", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(annotationDir, "FORMAL_STATE_SCHEMA_V1.json"), "utf8"));
  const template = fs.readFileSync(path.join(annotationDir, "FORMAL_RATER_FORM_TEMPLATE_V1.md"), "utf8");
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.annotation_guide_version.const, "annotation-guide-v1");
  assert.equal(schema.properties.state_id.pattern, "^heldout-[0-9]{3}$");
  const schemaText = JSON.stringify(schema);
  for (const forbidden of ["acceptableActions", "forbiddenActions", "policyOutput", "learnerAfter"]) {
    assert.doesNotMatch(schemaText, new RegExp(forbidden));
  }
  for (const value of ["NEEDS_EVIDENCE", "HINT", "RETRY_WITH_SCAFFOLD", "EASIER", "SIMILAR", "HARDER", "NEXT_CONCEPT"]) {
    assert.match(template, new RegExp(`\\b${value}\\b`));
  }
  assert.match(template, /\{\{STATE_PACK_SHA256\}\}/);
  assert.match(template, /\{\{HUMAN_SUBSET_SHA256\}\}/);
});

test("formal annotation freeze manifest pins every protocol artifact", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(annotationDir, "ANNOTATION_PROTOCOL_FREEZE_V1.json"), "utf8"));
  assert.equal(manifest.annotationProtocolVersion, "annotation-protocol-v1");
  assert.equal(manifest.annotationGuideVersion, "annotation-guide-v1");
  assert.equal(manifest.freezeTag, "annotation-protocol-v1");
  assert.equal(manifest.heldoutConstructed, false);
  assert.equal(manifest.policyOutputsObserved, false);
  for (const [fileName, expectedHash] of Object.entries(manifest.files)) {
    assert.equal(canonicalTextHash(path.join(annotationDir, fileName)), expectedHash);
  }
});

function readJsonl(fileName) {
  return fs.readFileSync(path.join(annotationDir, fileName), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function canonicalTextHash(filePath) {
  const canonicalText = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(canonicalText, "utf8").digest("hex").toUpperCase();
}

function withoutHistory(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.state_id;
  copy.history = [];
  return copy;
}

function withoutLearner(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.state_id;
  delete copy.learner_before;
  return copy;
}

function withoutLearnerAndHistory(state) {
  const copy = withoutLearner(state);
  copy.history = [];
  return copy;
}

function containsForbiddenField(value) {
  if (!value || typeof value !== "object") return false;
  const forbidden = new Set([
    "expectedStatus", "expected_status", "acceptableActions", "acceptable_actions",
    "forbiddenActions", "forbidden_actions", "policy", "policyOutput", "policy_output",
    "action", "learnerAfter", "learner_after"
  ]);
  return Object.entries(value).some(([key, nested]) => forbidden.has(key) || containsForbiddenField(nested));
}
