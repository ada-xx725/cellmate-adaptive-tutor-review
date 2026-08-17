const assert = require("node:assert/strict");
const test = require("node:test");
const { LlmDecisionEngine } = require("../out/adaptive/core/llmDecisionEngine");

test("uses a valid LLM action instead of the rule-policy action", async () => {
  const engine = new LlmDecisionEngine(selector({
    action: "SIMILAR",
    reason: "One more comparable task will confirm the new skill.",
    evidenceReferences: ["check:current", "mastery:for_loops"],
    confidence: 0.74
  }));

  const result = await engine.decide(input());
  assert.equal(result.status, "action");
  assert.equal(result.action, "SIMILAR");
  assert.equal(result.policy, "llm_adaptive");
  assert.equal(result.policyVersion, "llm-next-step-v6");
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.selectionConfidence, 0.74);
  assert.deepEqual(result.reasonCodes, ["LLM_SELECTED"]);
});

test("uses the full adaptive rule only when the LLM selection is unavailable", async () => {
  const engine = new LlmDecisionEngine(selector(undefined));
  const result = await engine.decide(input());
  assert.equal(result.status, "action");
  assert.equal(result.action, "NEXT_CONCEPT");
  assert.equal(result.policy, "llm_adaptive");
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.reasonCodes[0], "LLM_INVALID_FALLBACK");
  assert.equal(result.fallbackPolicyVersion, "full-adaptive-v1");
});

test("keeps the deterministic evidence gate and does not call the selector", async () => {
  let calls = 0;
  const engine = new LlmDecisionEngine({
    async select() {
      calls += 1;
      return {
        action: "HINT",
        reason: "A hint",
        evidenceReferences: [],
        confidence: 0.5
      };
    }
  });

  const learnerBefore = learner(50);
  const result = await engine.decide(input({
    learnerBefore,
    evidence: {
      status: "not_run",
      summary: "Run the course check.",
      source: "pybryt",
      confidence: "high",
      hasReliableCheck: false
    }
  }));
  assert.equal(result.status, "needs_evidence");
  assert.equal(result.policy, "llm_adaptive");
  assert.equal(calls, 0);
  assert.deepEqual(result.learnerAfter, learnerBefore);
});

function selector(value) {
  return { select: async () => value };
}

function input(overrides = {}) {
  return {
    taskSpec: taskSpec(),
    evidence: passedEvidence(),
    learnerBefore: learner(90),
    history: [
      {
        participantId: "student",
        fingerprint: "pass-2",
        exerciseId: "exercise-test",
        action: "HARDER",
        evidence: passedEvidence(),
        taskSpec: taskSpec(),
        createdAt: "2026-01-02T00:00:00.000Z"
      },
      {
        participantId: "student",
        fingerprint: "pass-1",
        exerciseId: "exercise-test",
        action: "SIMILAR",
        evidence: passedEvidence(),
        taskSpec: taskSpec(),
        createdAt: "2026-01-01T00:00:00.000Z"
      }
    ],
    courseContext: {
      exerciseId: "exercise-test",
      difficulty: 1,
      nextExercises: [],
      nextConcepts: ["conditionals"]
    },
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "exercise-test",
    sourceMode: "course_verified",
    taskSummary: "Use a for loop.",
    expectedBehavior: "Return the total.",
    title: "Loop total",
    promptMarkdown: "",
    targetConcepts: ["for_loops"],
    primaryConcept: "for_loops",
    difficulty: 1,
    confidence: 1
  };
}

function learner(score) {
  return { studentId: "student", mastery: { for_loops: score } };
}

function passedEvidence() {
  return {
    status: "passed",
    summary: "All assertions passed.",
    source: "assert",
    confidence: "high",
    hasReliableCheck: true
  };
}
