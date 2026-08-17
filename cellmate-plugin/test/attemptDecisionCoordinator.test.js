const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveAttemptDecision } = require("../out/adaptive/core/attemptDecisionCoordinator");

test("restores a saved attempt before loading learner state or calling the selector", async () => {
  const calls = [];
  const savedAttempt = attempt({ learnerAfter: learner(58) });
  const store = {
    async getAttempt(fingerprint) {
      calls.push(`attempt:${fingerprint}`);
      return savedAttempt;
    },
    async getLearner() {
      calls.push("learner");
      throw new Error("learner state must not be loaded for a saved attempt");
    },
    async attemptHistory() {
      calls.push("history");
      throw new Error("history must not be loaded for a saved attempt");
    }
  };
  const engine = {
    async decide() {
      calls.push("selector");
      throw new Error("selector must not run for a saved attempt");
    }
  };

  const result = await resolveAttemptDecision(request(), store, engine);

  assert.equal(result.kind, "saved_attempt");
  assert.equal(result.attempt, savedAttempt);
  assert.deepEqual(calls, ["attempt:fingerprint-1"]);
});

test("restores legacy attempts without rerunning the selector", async () => {
  let selectorCalls = 0;
  const legacyAttempt = attempt();
  const result = await resolveAttemptDecision(request(), {
    async getAttempt() {
      return legacyAttempt;
    },
    async getLearner() {
      return learner(99);
    },
    async attemptHistory() {
      return [];
    }
  }, {
    async decide() {
      selectorCalls += 1;
      return decision();
    }
  });

  assert.equal(result.kind, "saved_attempt");
  assert.equal(result.attempt.learnerAfter, undefined);
  assert.equal(selectorCalls, 0);
});

test("loads current state and times exactly one decision for a new attempt", async () => {
  const calls = [];
  const learnerBefore = learner(50);
  const history = [attempt({ fingerprint: "previous" })];
  const expectedDecision = decision();
  const times = [100, 145];
  const store = {
    async getAttempt() {
      calls.push("attempt");
      return undefined;
    },
    async getLearner(participantId) {
      calls.push(`learner:${participantId}`);
      return learnerBefore;
    },
    async attemptHistory(participantId) {
      calls.push(`history:${participantId}`);
      return history;
    }
  };
  const engine = {
    async decide(input) {
      calls.push("selector");
      assert.equal(input.learnerBefore, learnerBefore);
      assert.equal(input.history, history);
      assert.equal(input.taskSpec, taskSpec);
      assert.equal(input.evidence, evidence);
      return expectedDecision;
    }
  };

  const result = await resolveAttemptDecision(request(), store, engine, () => times.shift());

  assert.equal(result.kind, "new_decision");
  assert.equal(result.learnerBefore, learnerBefore);
  assert.equal(result.history, history);
  assert.equal(result.decision, expectedDecision);
  assert.equal(result.latencyMs, 45);
  assert.deepEqual(calls, ["attempt", "learner:participant-1", "history:participant-1", "selector"]);
});

const taskSpec = {
  id: "exercise-1",
  sourceMode: "generic_llm",
  taskSummary: "Write a loop",
  expectedBehavior: "Print three values",
  title: "Loop task",
  promptMarkdown: "Use a for loop.",
  targetConcepts: ["for_loops"],
  primaryConcept: "for_loops",
  difficulty: 2,
  confidence: 1
};

const evidence = {
  status: "passed",
  summary: "assert passed",
  source: "assert",
  confidence: "high",
  hasReliableCheck: true
};

function request() {
  return {
    attemptFingerprint: "fingerprint-1",
    participantId: "participant-1",
    taskSpec,
    evidence
  };
}

function learner(mastery) {
  return { studentId: "participant-1", mastery: { for_loops: mastery } };
}

function attempt(overrides = {}) {
  return {
    participantId: "participant-1",
    fingerprint: "fingerprint-1",
    exerciseId: "exercise-1",
    action: "SIMILAR",
    evidence,
    createdAt: "2026-08-15T00:00:00.000Z",
    ...overrides
  };
}

function decision() {
  return {
    status: "action",
    action: "SIMILAR",
    reasonCodes: ["PASS_PRACTICE"],
    evidenceUsed: ["status:passed"],
    learnerAfter: learner(58),
    policy: "llm_adaptive",
    policyVersion: "llm-next-step-v6",
    fallbackUsed: false
  };
}
