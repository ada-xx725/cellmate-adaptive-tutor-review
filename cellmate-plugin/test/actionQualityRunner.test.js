const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildActionQualityRunManifest,
  createProductionLlmEngine,
  findHardConstraintViolations,
  formalStateToDecisionInput,
  parseFormalActionQualityStates,
  runActionQualityStates,
  selectorConfigFromEnvironment,
  selectorConfigurationFingerprint
} = require("../out-evaluation/evaluation/actionQualityRunner");
const { LlmTransportError } = require("../out-evaluation/src/llmTransport");

const statePath = path.join(__dirname, "..", "evaluation", "states", "action-quality-v2.jsonl");
const states = parseFormalActionQualityStates(fs.readFileSync(statePath, "utf8"));

test("all 60 blinded states map to production DecisionInput without labels", () => {
  const inputs = states.map(formalStateToDecisionInput);
  assert.equal(inputs.length, 60);
  assert.equal(new Set(inputs.map((input) => input.learnerBefore.studentId)).size, 60);
  assert.equal(inputs.every((input) => input.taskSpec.confidence === 1), true);
  assert.equal(inputs.every((input) => !Object.hasOwn(input, "acceptableActions")), true);

  const course = inputs.find((input) => input.taskSpec.id === "exercise-1_6");
  assert.equal(course.evidence.source, "assert");
  assert.equal(course.courseContext.exerciseId, "exercise-1_6");
  assert.match(course.evidence.summary, /Coverage:/);

  const repeated = inputs.find((input) => input.history.length > 0);
  assert.match(repeated.history[0].fingerprint, /^history:[A-F0-9]{24}$/);
  assert.equal(repeated.history[0].taskSpec.id, repeated.taskSpec.id);
});

test("runner evaluates identical inputs under three primary conditions and the no-history ablation", async () => {
  const firstFailure = states.find((state) => state.stratum === "first_failure");
  const needsEvidence = states.find((state) => state.stratum === "needs_evidence");
  let transportCalls = 0;
  const config = { apiUrl: "https://selector.invalid/v1", apiKey: "top-secret", modelName: "selector-fixture" };
  const transport = {
    async completeJson(_config, request) {
      transportCalls += 1;
      assert.match(request.prompt, /Prompt version: llm-next-step-v6/);
      return {
        action: "HINT",
        reason: "A local first failure needs one targeted clue.",
        evidence_reference_ids: ["check:current"],
        confidence: 0.8
      };
    }
  };
  let tick = 0n;
  const records = await runActionQualityStates([firstFailure, needsEvidence], {
    runId: "runner-fixture",
    selectorModelVersion: config.modelName,
    selectorConfigurationFingerprint: selectorConfigurationFingerprint(config),
    llmEngine: createProductionLlmEngine(config, transport),
    createdAt: "2026-08-10T00:00:00.000Z",
    clock: () => {
      tick += 1_000_000n;
      return tick;
    }
  });

  assert.equal(records.length, 8);
  assert.equal(transportCalls, 1, "the deterministic evidence gate must skip the selector");
  assert.deepEqual(records.slice(0, 4).map((record) => record.condition), [
    "fixed-v2",
    "full-adaptive-v1",
    "llm-next-step-v6",
    "no-history-v1"
  ]);
  for (const stateId of [firstFailure.state_id, needsEvidence.state_id]) {
    const stateRecords = records.filter((record) => record.stateId === stateId);
    assert.equal(new Set(stateRecords.map((record) => record.inputSha256)).size, 1);
  }
  const selected = records.find((record) => record.stateId === firstFailure.state_id && record.condition === "llm-next-step-v6");
  assert.equal(selected.executionStatus, "completed");
  assert.equal(selected.trace.action, "HINT");
  assert.equal(selected.trace.selectorOutcome, "selected");
  assert.deepEqual(selected.hardConstraintViolations, []);
  const gated = records.find((record) => record.stateId === needsEvidence.state_id && record.condition === "llm-next-step-v6");
  assert.equal(gated.trace.status, "needs_evidence");
  assert.equal(gated.transportOutcome, "not_called");
  assert.equal(gated.needsEvidenceCorrect, true);

  const serialized = JSON.stringify(records);
  assert.equal(serialized.includes(config.apiKey), false);
  assert.equal(serialized.includes(config.apiUrl), false);
});

test("transport failures are retained with a category while other conditions complete", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const records = await runActionQualityStates([state], {
    runId: "timeout-fixture",
    selectorModelVersion: "selector-fixture",
    selectorConfigurationFingerprint: "FINGERPRINT",
    llmEngine: { decide: async () => { throw new LlmTransportError("timeout", "timed out", true); } },
    createdAt: "2026-08-10T00:00:00.000Z",
    clock: () => 0n
  });

  assert.equal(records.filter((record) => record.executionStatus === "completed").length, 3);
  const failed = records.find((record) => record.condition === "llm-next-step-v6");
  assert.equal(failed.executionStatus, "error");
  assert.equal(failed.errorCategory, "timeout");
  assert.equal(failed.trace, undefined);
});

test("hard-constraint checker is independent of the production selectors", () => {
  const failedState = states.find((state) => state.evidence.status === "failed" && !state.course_context);
  const failedInput = formalStateToDecisionInput(failedState);
  const failedViolations = findHardConstraintViolations(failedInput, {
    status: "action",
    action: "NEXT_CONCEPT",
    reasonCodes: ["LLM_SELECTED"],
    evidenceUsed: [],
    learnerAfter: failedInput.learnerBefore,
    policy: "llm_adaptive",
    policyVersion: "llm-next-step-v6",
    fallbackUsed: false,
    selectionEvidenceReferences: ["unknown:evidence"]
  });
  assert.deepEqual(failedViolations, [
    "FAILED_EVIDENCE_RECEIVED_PROGRESSION",
    "NEXT_CONCEPT_WITHOUT_COURSE_TARGET",
    "LLM_SELECTION_WITHOUT_VALID_PROVENANCE"
  ]);

  const needsInput = formalStateToDecisionInput(states.find((state) => state.stratum === "needs_evidence"));
  assert.deepEqual(findHardConstraintViolations(needsInput, {
    status: "action",
    action: "HINT",
    reasonCodes: [],
    evidenceUsed: [],
    learnerAfter: needsInput.learnerBefore,
    policy: "fixed",
    policyVersion: "fixture"
  }), ["INSUFFICIENT_EVIDENCE_RECEIVED_ACTION"]);
});

test("selector configuration uses only its namespace and fingerprints key presence, not key value", () => {
  const config = selectorConfigFromEnvironment({
    CELLMATE_EVAL_SELECTOR_API_URL: " https://selector.invalid/v1 ",
    CELLMATE_EVAL_SELECTOR_API_KEY: "selector-key",
    CELLMATE_EVAL_SELECTOR_MODEL: " selector-model ",
    CELLMATE_EVAL_JUDGE_API_KEY: "judge-key",
    CELLMATE_API_KEY: "general-key"
  });
  assert.deepEqual(config, {
    apiUrl: "https://selector.invalid/v1",
    apiKey: "selector-key",
    modelName: "selector-model"
  });
  assert.equal(
    selectorConfigurationFingerprint(config),
    selectorConfigurationFingerprint({ ...config, apiKey: "different-secret" })
  );
  assert.notEqual(
    selectorConfigurationFingerprint(config),
    selectorConfigurationFingerprint({ ...config, apiKey: "" })
  );
  assert.throws(() => selectorConfigFromEnvironment({}), /CELLMATE_EVAL_SELECTOR_API_URL/);
});

test("run manifest hashes locked records and reports errors without provider payloads", () => {
  const records = [{ executionStatus: "completed" }, { executionStatus: "error" }];
  const manifest = buildActionQualityRunManifest({
    runId: "manifest-fixture",
    seed: "20260810",
    recordsText: "one\ntwo\n",
    records,
    stateManifest: { statePackVersion: "action-quality-states-v2", sha256: "STATE" },
    protocolManifest: { protocolVersion: "action-quality-protocol-v2" },
    selectorModelVersion: "selector-fixture",
    selectorConfigurationFingerprint: "CONFIG",
    sourceCommit: "abc123",
    sourceDirty: false,
    sourceStatusSha256: "STATUS",
    createdAt: "2026-08-10T00:00:00.000Z"
  });
  assert.equal(manifest.recordCount, 2);
  assert.equal(manifest.completedCount, 1);
  assert.equal(manifest.errorCount, 1);
  assert.equal(manifest.suiteVersion, "evaluation-policy-suite-v3");
  assert.match(manifest.recordsSha256, /^[A-F0-9]{64}$/);
  assert.equal(manifest.apiKeyRecorded, false);
  assert.equal(manifest.rawProviderResponsesRecorded, false);
});
