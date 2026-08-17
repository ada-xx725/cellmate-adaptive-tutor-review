const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  createProductionJudgeCompleter,
  judgeCandidate
} = require("../out-evaluation/evaluation/actionQualityJudge");
const {
  createProductionLlmEngine,
  parseFormalActionQualityStates
} = require("../out-evaluation/evaluation/actionQualityRunner");
const {
  deterministicSimulationFaultMode,
  SimulatedLlmHttpClient
} = require("../out-evaluation/evaluation/simulation/simulatedProviders");
const { LlmTransport, LlmTransportError } = require("../out-evaluation/src/llmTransport");

const statePath = path.join(__dirname, "..", "evaluation", "states", "action-quality-v2.jsonl");
const states = parseFormalActionQualityStates(fs.readFileSync(statePath, "utf8"));
const selectorConfig = {
  apiUrl: "https://simulation.invalid/v1",
  apiKey: "",
  modelName: "cellmate-simulated-selector-v1"
};
const judgeConfig = {
  apiUrl: "https://simulation.invalid/v1",
  apiKey: "",
  modelName: "cellmate-simulated-judge-v1"
};

test("simulated selector uses production transport and returns grounded decisions", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const client = simulatedClient("selector", "valid");
  const engine = createProductionLlmEngine(selectorConfig, new LlmTransport(client));
  const decision = await engine.decide(requireDecisionInput(state));

  assert.equal(decision.status, "action");
  assert.equal(decision.action, "HINT");
  assert.equal(decision.fallbackUsed, false);
  assert.deepEqual(decision.selectionEvidenceReferences, ["check:current"]);

  const audit = client.getAudit();
  assert.equal(audit.networkCalls, 0);
  assert.equal(audit.rawPromptsRecorded, false);
  assert.equal(audit.rawResponsesRecorded, false);
  assert.equal(audit.requestCount, 1);
  assert.equal(audit.uniquePromptCount, 1);
  assert.equal(audit.events[0].modelName, selectorConfig.modelName);
  assert.equal(audit.events[0].timeoutMs, 15000);
  assert.equal(audit.events[0].authorizationHeaderPresent, false);
  assert.equal(audit.events[0].jsonResponseRequested, true);
  assert.equal(audit.events[0].openAiCompatibleEndpoint, true);
  assert.match(audit.events[0].promptFingerprint, /^[A-F0-9]{64}$/);
  assert.equal(JSON.stringify(audit).includes(state.task.task_summary), false);
});

test("simulated selector uses mastery and course provenance for progression", async () => {
  const state = states.find((candidate) =>
    candidate.stratum === "established_pass" && candidate.course_context?.next_concepts?.length
  );
  const client = simulatedClient("selector", "valid");
  const engine = createProductionLlmEngine(selectorConfig, new LlmTransport(client));
  const decision = await engine.decide(requireDecisionInput(state));

  assert.equal(decision.status, "action");
  assert.equal(decision.action, "NEXT_CONCEPT");
  assert.equal(decision.fallbackUsed, false);
  assert.equal(decision.selectionEvidenceReferences.includes("check:current"), true);
  assert.equal(decision.selectionEvidenceReferences.some((reference) => reference.startsWith("mastery:")), true);
  assert.equal(decision.selectionEvidenceReferences.some((reference) => reference.startsWith("course:")), true);
});

test("selector invalid provenance is repaired once through production validation", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const client = simulatedClient("selector", "repair_once");
  const engine = createProductionLlmEngine(selectorConfig, new LlmTransport(client));
  const decision = await engine.decide(requireDecisionInput(state));
  const audit = client.getAudit();

  assert.equal(decision.status, "action");
  assert.equal(decision.action, "HINT");
  assert.equal(decision.fallbackUsed, false);
  assert.equal(audit.requestCount, 2);
  assert.equal(audit.uniquePromptCount, 1);
  assert.deepEqual(audit.events.map((event) => event.attempt), [1, 2]);
  assert.deepEqual(audit.events.map((event) => event.outcome), ["invalid_response", "valid_response"]);
  assert.equal(audit.events[0].promptFingerprint, audit.events[1].promptFingerprint);
});

test("persistent selector invalidity reaches the production rule fallback", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const client = simulatedClient("selector", "persistent_invalid");
  const engine = createProductionLlmEngine(selectorConfig, new LlmTransport(client));
  const decision = await engine.decide(requireDecisionInput(state));

  assert.equal(decision.status, "action");
  assert.equal(decision.fallbackUsed, true);
  assert.equal(decision.reasonCodes[0], "LLM_INVALID_FALLBACK");
  assert.equal(client.getAudit().requestCount, 2);
  assert.equal(client.getAudit().outcomeCounts.invalid_response, 2);
});

test("simulated selector timeout is classified by production transport", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const client = simulatedClient("selector", "timeout");
  const engine = createProductionLlmEngine(selectorConfig, new LlmTransport(client));

  await assert.rejects(
    engine.decide(requireDecisionInput(state)),
    (error) => error instanceof LlmTransportError && error.category === "timeout" && error.retryable
  );
  assert.equal(client.getAudit().requestCount, 1);
  assert.equal(client.getAudit().outcomeCounts.timeout_error, 1);
});

test("simulated judge uses production transport and blinded evidence references", async () => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const client = simulatedClient("judge", "valid");
  const record = await judgeCandidate(
    candidateFor(state, "HINT"),
    "simulated-judge-test",
    createProductionJudgeCompleter(judgeConfig, new LlmTransport(client))
  );

  assert.equal(record.executionStatus, "completed");
  assert.equal(record.attemptCount, 1);
  assert.equal(record.score, 5);
  assert.equal(record.criticalError, false);
  assert.deepEqual(record.evidenceReferences, ["check:status"]);
  assert.equal(client.getAudit().events[0].modelName, judgeConfig.modelName);
});

test("simulated judge covers repair, persistent invalidity, and timeout paths", async (t) => {
  const state = states.find((candidate) => candidate.stratum === "first_failure");
  const cases = [
    { mode: "repair_once", status: "completed", attempts: 2, category: undefined },
    { mode: "persistent_invalid", status: "error", attempts: 2, category: "invalid_output" },
    { mode: "timeout", status: "error", attempts: 1, category: "timeout" }
  ];
  for (const fixture of cases) {
    await t.test(fixture.mode, async () => {
      const client = simulatedClient("judge", fixture.mode);
      const record = await judgeCandidate(
        candidateFor(state, "HINT"),
        `simulated-judge-${fixture.mode}`,
        createProductionJudgeCompleter(judgeConfig, new LlmTransport(client))
      );
      assert.equal(record.executionStatus, fixture.status);
      assert.equal(record.attemptCount, fixture.attempts);
      assert.equal(record.errorCategory, fixture.category);
      assert.equal(client.getAudit().requestCount, fixture.attempts);
    });
  }
});

test("default fault schedules guarantee all controlled paths in a full rehearsal", () => {
  assert.deepEqual(countModes("selector", 52), {
    valid: 43,
    repair_once: 4,
    persistent_invalid: 3,
    timeout: 2
  });
  assert.deepEqual(countModes("judge", 240), {
    valid: 209,
    repair_once: 18,
    persistent_invalid: 8,
    timeout: 5
  });
});

function simulatedClient(role, mode) {
  return new SimulatedLlmHttpClient({ role, faultResolver: () => mode });
}

function requireDecisionInput(state) {
  assert.ok(state, "required state fixture is missing");
  const { formalStateToDecisionInput } = require("../out-evaluation/evaluation/actionQualityRunner");
  return formalStateToDecisionInput(state);
}

function candidateFor(state, action) {
  assert.ok(state, "required state fixture is missing");
  return {
    candidateId: "candidate-simulated-test",
    sourceRunId: "simulated-source-test",
    stateId: state.state_id,
    condition: "llm-next-step-v6",
    candidateStatus: "action",
    candidateAction: action,
    state
  };
}

function countModes(role, count) {
  const totals = { valid: 0, repair_once: 0, persistent_invalid: 0, timeout: 0 };
  for (let promptOrdinal = 1; promptOrdinal <= count; promptOrdinal += 1) {
    totals[deterministicSimulationFaultMode({ role, promptFingerprint: "unused", promptOrdinal })] += 1;
  }
  return totals;
}
