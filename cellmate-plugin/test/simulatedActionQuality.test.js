const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildSimulatedActionQualityEvaluation,
  checkSimulatedEvaluationArtifacts,
  parseSimulatedEvaluationCliArguments,
  SIMULATED_EVALUATION_CREATED_AT,
  SIMULATED_EVALUATION_VERSION,
  writeSimulatedEvaluationArtifacts
} = require("../out-evaluation/evaluation/runSimulatedActionQuality");

const pluginRoot = path.join(__dirname, "..");
const baseOptions = {
  simulationId: "simulated-e2e-test",
  seed: "20260811",
  resamples: 100,
  pluginRoot
};

test("full 60-state simulation exercises runner, judge, and statistics failure paths", async () => {
  const bundle = await buildSimulatedActionQualityEvaluation(baseOptions);
  const counts = bundle.simulationManifest.counts;

  assert.equal(bundle.simulationManifest.simulated, true);
  assert.equal(bundle.simulationManifest.developmentOnly, true);
  assert.equal(bundle.simulationManifest.formalEvidence, false);
  assert.equal(bundle.simulationManifest.simulationVersion, SIMULATED_EVALUATION_VERSION);
  assert.equal(bundle.simulationManifest.deterministicCreatedAt, SIMULATED_EVALUATION_CREATED_AT);
  assert.equal(bundle.simulationManifest.networkCalls, 0);
  assert.deepEqual(counts, {
    states: 60,
    runRecords: 240,
    runCompleted: 238,
    runErrors: 2,
    llmSelected: 47,
    llmRuleFallbacks: 3,
    llmEvidenceGateSkips: 8,
    llmTransportErrors: 2,
    hardConstraintViolations: 6,
    judgeRecords: 238,
    judgeCompleted: 225,
    judgeErrors: 13,
    judgeRepairs: 26,
    selectorUniquePrompts: 52,
    selectorRequests: 59,
    judgeUniquePrompts: 238,
    judgeRequests: 264
  });

  assert.equal(bundle.runRecords.length, 240);
  assert.equal(bundle.runRecords.filter((record) => record.executionStatus === "error").length, 2);
  assert.equal(
    bundle.runRecords.filter((record) => record.executionStatus === "error")
      .every((record) => record.condition === "llm-next-step-v6" && record.errorCategory === "timeout"),
    true
  );
  const violations = bundle.runRecords.filter((record) => record.hardConstraintViolations.length);
  assert.equal(violations.length, 6);
  assert.equal(violations.every((record) =>
    record.condition === "full-adaptive-v1"
      && record.trace.action === "NEXT_CONCEPT"
      && record.hardConstraintViolations.length === 1
      && record.hardConstraintViolations[0] === "NEXT_CONCEPT_WITHOUT_COURSE_TARGET"
  ), true);
  assert.deepEqual(violations.map((record) => record.stateId), [
    "heldout-v2-036",
    "heldout-v2-038",
    "heldout-v2-040",
    "heldout-v2-042",
    "heldout-v2-058",
    "heldout-v2-060"
  ]);

  assert.deepEqual(bundle.selectorAudit.faultModeCounts, {
    valid: 43,
    repair_once: 4,
    persistent_invalid: 3,
    timeout: 2
  });
  assert.deepEqual(bundle.selectorAudit.outcomeCounts, {
    valid_response: 47,
    invalid_response: 10,
    timeout_error: 2
  });
  assert.deepEqual(bundle.judgeAudit.faultModeCounts, {
    valid: 207,
    repair_once: 18,
    persistent_invalid: 8,
    timeout: 5
  });
  assert.deepEqual(bundle.judgeAudit.outcomeCounts, {
    valid_response: 225,
    invalid_response: 34,
    timeout_error: 5
  });
  for (const audit of [bundle.selectorAudit, bundle.judgeAudit]) {
    assert.equal(audit.networkCalls, 0);
    assert.equal(audit.rawPromptsRecorded, false);
    assert.equal(audit.rawResponsesRecorded, false);
    assert.equal(audit.events.every((event) =>
      event.timeoutMs === 15000
        && event.authorizationHeaderPresent === false
        && event.jsonResponseRequested === true
        && event.openAiCompatibleEndpoint === true
    ), true);
  }

  assert.equal(bundle.judgeRecords.length, 238);
  assert.deepEqual(errorCategoryCounts(bundle.judgeRecords), { invalid_output: 8, timeout: 5 });
  assert.equal(bundle.statistics.conditions.length, 4);
  assert.equal(bundle.statistics.conditions.every((condition) => condition.runCount === 60), true);
  const llmStatistics = bundle.statistics.conditions.find((condition) => condition.condition === "llm-next-step-v6");
  assert.deepEqual(llmStatistics.selectorFallback, {
    numerator: 3,
    denominator: 52,
    rate: 3 / 52,
    ci95: llmStatistics.selectorFallback.ci95
  });
});

test("all nine artifacts are explicitly simulated, hashed, and byte-reproducible", async () => {
  const first = await buildSimulatedActionQualityEvaluation(baseOptions);
  const repeated = await buildSimulatedActionQualityEvaluation(baseOptions);

  assert.equal(first.artifacts.length, 9);
  assert.deepEqual(
    first.artifacts.map((item) => ({ fileName: item.fileName, text: item.text, sha256: item.sha256 })),
    repeated.artifacts.map((item) => ({ fileName: item.fileName, text: item.text, sha256: item.sha256 }))
  );
  for (const item of first.artifacts) {
    assert.equal(item.sha256, sha256(item.text));
    assert.match(item.text, /simulated["=:\s]|SIMULATED/);
    assert.match(item.text, /"formalEvidence":\s*false|formalEvidence=false|formal_evidence=false|NOT FORMAL EVIDENCE/);
  }

  const locked = first.simulationManifest.artifacts;
  assert.equal(Object.keys(locked).length, 8);
  for (const item of first.artifacts.filter((artifact) => artifact.fileName !== "simulation.manifest.json")) {
    assert.equal(locked[item.fileName].sha256, item.sha256);
    assert.equal(locked[item.fileName].bytes, Buffer.byteLength(item.text, "utf8"));
  }
  assert.equal(first.simulationManifest.artifactLock.manifestSelfHashExcluded, true);
});

test("artifact directory is write-once and check mode detects byte drift without overwriting", async (t) => {
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "cellmate-simulated-eval-"));
  t.after(async () => fs.rm(temporaryRoot, { recursive: true, force: true }));
  const bundle = await buildSimulatedActionQualityEvaluation({
    ...baseOptions,
    simulationId: "simulated-artifact-lock-test",
    resamples: 25
  });
  const target = await writeSimulatedEvaluationArtifacts(bundle, temporaryRoot);
  assert.equal(path.dirname(target), temporaryRoot);
  assert.equal(path.basename(target), "simulated-artifact-lock-test.simulated");
  assert.deepEqual((await fs.readdir(target)).sort(), bundle.artifacts.map((item) => item.fileName).sort());

  const manifestPath = path.join(target, "simulation.manifest.json");
  const before = await fs.stat(manifestPath);
  assert.equal(await checkSimulatedEvaluationArtifacts(bundle, temporaryRoot), target);
  const after = await fs.stat(manifestPath);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
  await assert.rejects(
    writeSimulatedEvaluationArtifacts(bundle, temporaryRoot),
    /Refusing to overwrite locked simulation artifacts/
  );

  await fs.appendFile(manifestPath, "drift\n", "utf8");
  await assert.rejects(
    checkSimulatedEvaluationArtifacts(bundle, temporaryRoot),
    /Simulation artifact mismatch: simulation\.manifest\.json/
  );
});

test("simulation identifiers cannot be confused with formal evidence", async () => {
  await assert.rejects(
    buildSimulatedActionQualityEvaluation({ ...baseOptions, simulationId: "formal-results" }),
    /must not contain 'formal'/
  );
  await assert.rejects(
    buildSimulatedActionQualityEvaluation({ ...baseOptions, simulationId: "../escape" }),
    /unsupported characters/
  );
  await assert.rejects(
    buildSimulatedActionQualityEvaluation({ ...baseOptions, resamples: 0 }),
    /positive integer/
  );
});

test("CLI accepts named options and Windows npm positional forwarding", () => {
  assert.deepEqual(parseSimulatedEvaluationCliArguments([
    "--simulation-id", "simulated-cli-test",
    "--seed", "20260811",
    "--resamples", "250",
    "--check"
  ]), {
    simulationId: "simulated-cli-test",
    seed: "20260811",
    resamples: 250,
    check: true
  });
  assert.deepEqual(parseSimulatedEvaluationCliArguments([
    "simulated-cli-test", "20260811", "250", "check"
  ]), {
    simulationId: "simulated-cli-test",
    seed: "20260811",
    resamples: 250,
    check: true
  });
  assert.deepEqual(parseSimulatedEvaluationCliArguments([
    "simulated-cli-test", "20260811"
  ]), {
    simulationId: "simulated-cli-test",
    seed: "20260811",
    resamples: 10000,
    check: false
  });
  assert.throws(
    () => parseSimulatedEvaluationCliArguments(["--unknown"]),
    /Unsupported simulation option/
  );
});

function errorCategoryCounts(records) {
  return records.reduce((counts, record) => {
    if (record.executionStatus === "error") {
      counts[record.errorCategory] = (counts[record.errorCategory] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function sha256(content) {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}
