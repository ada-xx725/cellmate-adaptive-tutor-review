const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pluginRoot = path.join(__dirname, "..");
const evaluationDir = path.join(pluginRoot, "evaluation");

test("formal action-quality protocol freezes conditions, blinding, metrics, and execution order", () => {
  const protocol = fs.readFileSync(path.join(evaluationDir, "ACTION_QUALITY_PROTOCOL_V1.md"), "utf8");
  for (const identity of [
    "action-quality-protocol-v1", "evaluation-policy-suite-v2", "fixed-v2",
    "full-adaptive-v1", "no-history-v1", "llm-next-step-v6",
    "action-quality-judge-v1", "action-quality-statistics-v1"
  ]) {
    assert.match(protocol, new RegExp(identity));
  }
  assert.match(protocol, /60 blinded states/i);
  assert.match(protocol, /40 `course_verified`, 10 `generated_attempt`, and 10 `generic_llm`/);
  assert.match(protocol, /must not receive policy name/i);
  assert.match(protocol, /repaired once/i);
  assert.match(protocol, /hard-constraint violation rate/i);
  assert.match(protocol, /Needs-Evidence Accuracy/i);
  assert.match(protocol, /paired bootstrap/i);
  assert.match(protocol, /formal results, report, and logbook as separate commits/i);
});

test("protocol freeze manifest pins every implementation boundary without claiming results", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(evaluationDir, "ACTION_QUALITY_PROTOCOL_FREEZE_V1.json"), "utf8"));
  assert.equal(manifest.protocolVersion, "action-quality-protocol-v1");
  assert.equal(manifest.suiteVersion, "evaluation-policy-suite-v2");
  assert.equal(manifest.selectorPromptVersion, "llm-next-step-v6");
  assert.equal(manifest.decisionTraceSchemaVersion, 3);
  assert.equal(manifest.formalStatePackBuilt, false);
  assert.equal(manifest.formalSelectorRunProduced, false);
  assert.equal(manifest.formalJudgeRunProduced, false);
  assert.equal(manifest.formalReportProduced, false);
  assert.ok(Object.keys(manifest.files).length >= 8);
  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    assert.equal(canonicalHash(path.join(pluginRoot, relativePath)), expectedHash, relativePath);
  }
});

test("v2 protocol records contamination boundary, fixed models, pacing, and execution order", () => {
  const protocol = fs.readFileSync(path.join(evaluationDir, "ACTION_QUALITY_PROTOCOL_V2.md"), "utf8");
  for (const identity of [
    "action-quality-protocol-v2", "evaluation-policy-suite-v3", "action-quality-states-v2",
    "gpt-4o-mini-2024-07-18", "gpt-4.1-2025-04-14", "20260816",
    "aq-v2-primary-001", "aq-v2-judge-001", "aq-v2-summary-001"
  ]) {
    assert.match(protocol, new RegExp(identity));
  }
  assert.match(protocol, /heldout-006/);
  assert.match(protocol, /complete four-state accumulator cluster/i);
  assert.match(protocol, /at least 3000 milliseconds apart/i);
  assert.match(protocol, /10,000 resamples/i);
  assert.match(protocol, /never overwritten or silently rerun/i);
  assert.match(protocol, /no claim about real-student learning gains/i);
});

test("v2 freeze pins production, state, runner, judge, and statistics boundaries", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(evaluationDir, "ACTION_QUALITY_PROTOCOL_FREEZE_V2.json"), "utf8"));
  assert.equal(manifest.protocolVersion, "action-quality-protocol-v2");
  assert.equal(manifest.suiteVersion, "evaluation-policy-suite-v3");
  assert.equal(manifest.statePackVersion, "action-quality-states-v2");
  assert.equal(manifest.selectorPromptVersion, "llm-next-step-v6");
  assert.equal(manifest.decisionTraceSchemaVersion, 3);
  assert.equal(manifest.formalStatePackBuilt, true);
  assert.equal(manifest.formalSelectorRunProduced, false);
  assert.equal(manifest.formalJudgeRunProduced, false);
  assert.equal(manifest.formalReportProduced, false);
  assert.equal(manifest.selectorModel, "gpt-4o-mini-2024-07-18");
  assert.equal(manifest.judgeModel, "gpt-4.1-2025-04-14");
  assert.equal(manifest.seed, "20260816");
  assert.equal(manifest.minCandidateIntervalMs, 3000);
  assert.ok(Object.keys(manifest.files).length >= 12);
  for (const [relativePath, expectedHash] of Object.entries(manifest.files)) {
    assert.equal(canonicalHash(path.join(pluginRoot, relativePath)), expectedHash, relativePath);
  }
});

function canonicalHash(filePath) {
  const content = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(content, "utf8").digest("hex").toUpperCase();
}
