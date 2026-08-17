const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  buildBlindedJudgeCandidates,
  buildBlindedJudgePrompt,
  buildJudgeManifest,
  buildStateEvidenceCatalog,
  judgeCandidate,
  judgeConfigFromEnvironment,
  judgeConfigurationFingerprint,
  runBlindedJudge
} = require("../out-evaluation/evaluation/actionQualityJudge");
const { parseFormalActionQualityStates } = require("../out-evaluation/evaluation/actionQualityRunner");
const { LlmTransportError } = require("../out-evaluation/src/llmTransport");

const statePath = path.join(__dirname, "..", "evaluation", "states", "action-quality-v2.jsonl");
const states = parseFormalActionQualityStates(fs.readFileSync(statePath, "utf8"));

test("candidate order is deterministic, seeded, and assigned opaque IDs", () => {
  const records = runRecords(states[0].state_id);
  const first = buildBlindedJudgeCandidates([states[0]], records, "20260810");
  const repeated = buildBlindedJudgeCandidates([states[0]], records, "20260810");
  const changed = buildBlindedJudgeCandidates([states[0]], records, "20260811");

  assert.deepEqual(first.map(candidateIdentity), repeated.map(candidateIdentity));
  assert.notDeepEqual(first.map((candidate) => candidate.condition), changed.map((candidate) => candidate.condition));
  assert.deepEqual(first.map((candidate) => candidate.candidateId).sort(), [
    "candidate-0001",
    "candidate-0002",
    "candidate-0003",
    "candidate-0004"
  ]);
  assert.equal(first.every((candidate) => candidate.sourceRunId === "source-run"), true);
});

test("candidate construction rejects incomplete or duplicate source runs", () => {
  const records = runRecords(states[0].state_id);
  assert.throws(
    () => buildBlindedJudgeCandidates([states[0]], records.slice(0, 3), "20260810"),
    /exactly 4 state-condition records/
  );
  assert.throws(
    () => buildBlindedJudgeCandidates([states[0]], [records[0], records[0], records[2], records[3]], "20260810"),
    /Duplicate source run record/
  );
});

test("judge prompt contains one state and decision but excludes production provenance", () => {
  const candidate = buildBlindedJudgeCandidates([states[0]], runRecords(states[0].state_id), "20260810")[0];
  const request = buildBlindedJudgePrompt(candidate);
  const combined = `${request.system}\n${request.prompt}`;

  assert.match(combined, /action-quality-judge-v1/);
  assert.match(combined, new RegExp(candidate.candidateId));
  assert.match(combined, /Candidate decision:/);
  assert.match(combined, /State evidence catalog:/);
  for (const forbidden of [
    "fixed-v2",
    "full-adaptive-v1",
    "llm-next-step-v6",
    "no-history-v1",
    "selector-model-secret",
    "selection-reason-secret",
    "fallbackUsed",
    "reasonCodes",
    "latencyMs",
    '"condition"',
    '"policy"'
  ]) {
    assert.equal(combined.includes(forbidden), false, `judge prompt leaked ${forbidden}`);
  }
  const catalog = buildStateEvidenceCatalog(candidate.state);
  assert.equal(new Set(catalog.map((entry) => entry.id)).size, catalog.length);
  assert.equal(catalog.some((entry) => entry.id === "check:coverage"), true);
});

test("valid grounded judge output is retained without repair", async () => {
  const candidate = oneCandidate();
  const record = await judgeCandidate(candidate, "judge-run", completer([
    validAssessment({ score: 4, confidence: 5 })
  ]));

  assert.equal(record.executionStatus, "completed");
  assert.equal(record.attemptCount, 1);
  assert.equal(record.score, 4);
  assert.equal(record.criticalError, false);
  assert.equal(record.confidence, 5);
  assert.deepEqual(record.evidenceReferences, ["check:status", "task:summary"]);
  assert.equal(record.condition, candidate.condition, "condition is reattached only after judging");
});

test("ungrounded output is repaired exactly once", async () => {
  const candidate = oneCandidate();
  const requests = [];
  const fake = {
    async completeJson(request) {
      requests.push(request);
      return requests.length === 1
        ? validAssessment({ evidence_reference_ids: ["policy:secret"] })
        : validAssessment({ score: 3, confidence: 3 });
    }
  };
  const record = await judgeCandidate(candidate, "judge-run", fake);

  assert.equal(requests.length, 2);
  assert.match(requests[1].system, /previous response was rejected/i);
  assert.equal(record.executionStatus, "completed");
  assert.equal(record.attemptCount, 2);
  assert.equal(record.score, 3);
});

test("a second invalid response becomes a judge failure without a guessed score", async () => {
  const candidate = oneCandidate();
  const record = await judgeCandidate(candidate, "judge-run", completer([
    validAssessment({ score: 1, critical_error: false }),
    validAssessment({ evidence_reference_ids: [] })
  ]));

  assert.equal(record.executionStatus, "error");
  assert.equal(record.attemptCount, 2);
  assert.equal(record.errorCategory, "invalid_output");
  assert.equal(record.score, undefined);
  assert.equal(record.criticalError, undefined);
});

test("invalid JSON is repairable, while timeout is retained without retry", async () => {
  const candidate = oneCandidate();
  let invalidJsonCalls = 0;
  const repaired = await judgeCandidate(candidate, "judge-run", {
    async completeJson() {
      invalidJsonCalls += 1;
      if (invalidJsonCalls === 1) throw new LlmTransportError("invalid_json", "invalid", false);
      return validAssessment({ score: 4 });
    }
  });
  assert.equal(repaired.executionStatus, "completed");
  assert.equal(repaired.attemptCount, 2);

  let timeoutCalls = 0;
  const timedOut = await judgeCandidate(candidate, "judge-run", {
    async completeJson() {
      timeoutCalls += 1;
      throw new LlmTransportError("timeout", "timeout", true);
    }
  });
  assert.equal(timeoutCalls, 1);
  assert.equal(timedOut.executionStatus, "error");
  assert.equal(timedOut.attemptCount, 1);
  assert.equal(timedOut.errorCategory, "timeout");
});

test("judge configuration reads only the judge namespace and never fingerprints key value", () => {
  const config = judgeConfigFromEnvironment({
    CELLMATE_EVAL_JUDGE_API_URL: " https://judge.invalid/v1 ",
    CELLMATE_EVAL_JUDGE_API_KEY: "judge-key",
    CELLMATE_EVAL_JUDGE_MODEL: " judge-model ",
    CELLMATE_EVAL_SELECTOR_API_KEY: "selector-key",
    CELLMATE_API_KEY: "general-key"
  });
  assert.deepEqual(config, {
    apiUrl: "https://judge.invalid/v1",
    apiKey: "judge-key",
    modelName: "judge-model"
  });
  assert.equal(
    judgeConfigurationFingerprint(config),
    judgeConfigurationFingerprint({ ...config, apiKey: "another-secret" })
  );
  assert.throws(() => judgeConfigFromEnvironment({}), /CELLMATE_EVAL_JUDGE_API_URL/);
});

test("judge runner spaces candidate starts and reports progress without changing order", async () => {
  const candidates = buildBlindedJudgeCandidates([states[0]], runRecords(states[0].state_id), "20260810").slice(0, 3);
  let clock = 0;
  const starts = [];
  const waits = [];
  const progress = [];
  const records = await runBlindedJudge(candidates, "judge-run", {
    async completeJson() {
      starts.push(clock);
      clock += 125;
      return validAssessment();
    }
  }, {
    minCandidateIntervalMs: 3000,
    now: () => clock,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      clock += milliseconds;
    },
    onProgress: (event) => progress.push([event.completed, event.total, event.record.candidateId])
  });

  assert.deepEqual(starts, [0, 3000, 6000]);
  assert.deepEqual(waits, [2875, 2875]);
  assert.deepEqual(records.map((record) => record.candidateId), candidates.map((candidate) => candidate.candidateId));
  assert.deepEqual(progress, [
    [1, 3, candidates[0].candidateId],
    [2, 3, candidates[1].candidateId],
    [3, 3, candidates[2].candidateId]
  ]);
  await assert.rejects(
    runBlindedJudge(candidates, "judge-run", completer([]), { minCandidateIntervalMs: -1 }),
    /non-negative integer/
  );
});

test("judge manifest records coverage, repairs, source hashes, and model overlap", () => {
  const records = [
    { executionStatus: "completed", attemptCount: 1 },
    { executionStatus: "completed", attemptCount: 2 },
    { executionStatus: "error", attemptCount: 2 }
  ];
  const manifest = buildJudgeManifest({
    judgeRunId: "judge-run",
    sourceRunId: "source-run",
    seed: "20260810",
    recordsText: "records\n",
    records,
    sourceRecordsSha256: "SOURCE_RECORDS",
    sourceManifestSha256: "SOURCE_MANIFEST",
    statePackSha256: "STATE",
    selectorModelVersion: "same-model",
    judgeModelVersion: "same-model",
    judgeConfigurationFingerprint: "CONFIG",
    minCandidateIntervalMs: 3000,
    sourceCommit: "abc123",
    sourceDirty: false,
    createdAt: "2026-08-10T00:00:00.000Z"
  });
  assert.equal(manifest.candidateCount, 3);
  assert.equal(manifest.completedCount, 2);
  assert.equal(manifest.errorCount, 1);
  assert.equal(manifest.repairedCount, 2);
  assert.equal(manifest.minCandidateIntervalMs, 3000);
  assert.equal(manifest.selectorJudgeModelNameIdentical, true);
  assert.match(manifest.recordsSha256, /^[A-F0-9]{64}$/);
  assert.equal(manifest.apiKeyRecorded, false);
  assert.equal(manifest.rawProviderResponsesRecorded, false);
});

function oneCandidate() {
  return buildBlindedJudgeCandidates([states[0]], runRecords(states[0].state_id), "20260810")[0];
}

function runRecords(stateId) {
  return [
    record(stateId, "fixed-v2", "RETRY_WITH_SCAFFOLD"),
    record(stateId, "full-adaptive-v1", "HINT"),
    record(stateId, "llm-next-step-v6", "HINT"),
    record(stateId, "no-history-v1", "EASIER")
  ];
}

function record(stateId, condition, action) {
  return {
    runId: "source-run",
    stateId,
    condition,
    executionStatus: "completed",
    trace: {
      status: "action",
      action,
      policy: condition,
      modelVersion: "selector-model-secret",
      selectionExplanation: "selection-reason-secret",
      fallbackUsed: true,
      reasonCodes: ["SECRET_REASON"],
      latencyMs: 123
    }
  };
}

function candidateIdentity(candidate) {
  return [candidate.candidateId, candidate.stateId, candidate.condition];
}

function completer(responses) {
  let index = 0;
  return { completeJson: async () => responses[index++] };
}

function validAssessment(overrides = {}) {
  return {
    score: 4,
    critical_error: false,
    confidence: 4,
    reason: "The decision is supported by the current check and task.",
    evidence_reference_ids: ["check:status", "task:summary"],
    ...overrides
  };
}
