const assert = require("node:assert/strict");
const test = require("node:test");
const { createDecisionTrace } = require("../out/adaptive/core/decisionTrace");

test("decision traces preserve the complete versioned decision boundary", () => {
  const trace = createDecisionTrace({
    stateId: "state-1",
    participantId: "participant-1",
    taskSpec: { id: "exercise-1", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return a total", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "failed", summary: "AssertionError", source: "assert", confidence: "high", hasReliableCheck: true },
    learnerBefore: { studentId: "participant-1", mastery: { accumulators: 50 } },
    history: [],
    decision: { status: "action", action: "RETRY_WITH_SCAFFOLD", reasonCodes: ["FIRST_RELIABLE_FAILURE"], evidenceUsed: ["status:failed"], learnerAfter: { studentId: "participant-1", mastery: { accumulators: 44 } }, policy: "full_adaptive", policyVersion: "full-adaptive-v1" },
    latencyMs: 3,
    modelVersion: "deterministic-fallback",
    promptVersion: "adaptive-feedback-v1",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(trace.schemaVersion, 3);
  assert.match(trace.traceId, /^trace:[a-f0-9]{24}$/);
  assert.equal(trace.policyUsesLlm, false);
  assert.equal(trace.action, "RETRY_WITH_SCAFFOLD");
  assert.equal(trace.policyVersion, "full-adaptive-v1");
  assert.equal(trace.createdAt, "2026-01-01T00:00:00.000Z");
});

test("needs-evidence traces omit actions and preserve learner state", () => {
  const learner = { studentId: "participant-1", mastery: { accumulators: 50 } };
  const trace = createDecisionTrace({
    stateId: "state-needs-evidence",
    participantId: "participant-1",
    taskSpec: { id: "exercise-1", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return a total", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "not_run", summary: "Run the check first", source: "pybryt", confidence: "high", hasReliableCheck: false },
    learnerBefore: learner,
    history: [],
    decision: { status: "needs_evidence", reasonCodes: ["CHECK_NOT_RUN"], evidenceUsed: ["status:not_run"], learnerAfter: learner, policy: "full_adaptive", policyVersion: "full-adaptive-v1" },
    latencyMs: 1,
    modelVersion: "not-used-needs-evidence",
    promptVersion: "not-used-needs-evidence",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  const serialized = JSON.parse(JSON.stringify(trace));
  assert.equal(serialized.status, "needs_evidence");
  assert.equal(Object.hasOwn(serialized, "action"), false);
  assert.deepEqual(serialized.reasonCodes, ["CHECK_NOT_RUN"]);
  assert.deepEqual(serialized.learnerAfter, learner);
});

test("LLM decision traces record the selection explanation and fallback state", () => {
  const trace = createDecisionTrace({
    stateId: "state-llm",
    participantId: "participant-1",
    taskSpec: { id: "exercise-1", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return a total", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "passed", summary: "All checks passed", source: "assert", confidence: "high", hasReliableCheck: true },
    learnerBefore: { studentId: "participant-1", mastery: { accumulators: 58 } },
    history: [],
    decision: {
      status: "action",
      action: "SIMILAR",
      reasonCodes: ["LLM_SELECTED"],
      evidenceUsed: ["status:passed"],
      learnerAfter: { studentId: "participant-1", mastery: { accumulators: 66 } },
      policy: "llm_adaptive",
      policyVersion: "llm-next-step-v1",
      selectionExplanation: "The learner passed once but needs one comparable task.",
      selectionConfidence: 0.76,
      selectionEvidenceReferences: ["check:current", "mastery:accumulators"],
      fallbackUsed: false
    },
    latencyMs: 120,
    modelVersion: "gpt-4.1-mini",
    promptVersion: "llm-next-step-v1",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  assert.equal(trace.schemaVersion, 3);
  assert.equal(trace.policyUsesLlm, true);
  assert.equal(trace.fallbackUsed, false);
  assert.equal(trace.selectionConfidence, 0.76);
  assert.deepEqual(trace.selectionEvidenceReferences, ["check:current", "mastery:accumulators"]);
  assert.equal(trace.selectorOutcome, "selected");
});

test("rule fallback traces do not claim that the LLM selected the action", () => {
  const trace = createDecisionTrace({
    stateId: "state-fallback",
    participantId: "participant-1",
    taskSpec: { id: "exercise-1", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return a total", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "failed", summary: "AssertionError", source: "assert", confidence: "high", hasReliableCheck: true },
    learnerBefore: { studentId: "participant-1", mastery: { accumulators: 50 } },
    history: [],
    decision: {
      status: "action",
      action: "RETRY_WITH_SCAFFOLD",
      reasonCodes: ["LLM_INVALID_FALLBACK", "FIRST_RELIABLE_FAILURE"],
      evidenceUsed: ["status:failed"],
      learnerAfter: { studentId: "participant-1", mastery: { accumulators: 44 } },
      policy: "llm_adaptive",
      policyVersion: "llm-next-step-v1",
      fallbackUsed: true,
      fallbackPolicyVersion: "full-adaptive-v1"
    },
    latencyMs: 15000,
    modelVersion: "gpt-4.1-mini",
    promptVersion: "llm-next-step-v1"
  });
  assert.equal(trace.policyUsesLlm, false);
  assert.equal(trace.fallbackUsed, true);
  assert.equal(trace.selectorOutcome, "rule_fallback");
  assert.equal(trace.modelVersion, "gpt-4.1-mini");
  assert.equal(trace.fallbackPolicyVersion, "full-adaptive-v1");
});

test("schema v3 history excludes feedback, support, and free-text evidence", () => {
  const trace = createDecisionTrace({
    stateId: "state-history",
    participantId: "participant-1",
    taskSpec: { id: "exercise-1", sourceMode: "course_verified", taskSummary: "Sum values", expectedBehavior: "Return a total", title: "Sum", promptMarkdown: "", targetConcepts: ["accumulators"], primaryConcept: "accumulators", difficulty: 2, confidence: 1 },
    evidence: { status: "passed", summary: "Passed", source: "assert", confidence: "high", hasReliableCheck: true },
    learnerBefore: { studentId: "participant-1", mastery: { accumulators: 70 } },
    history: [{
      participantId: "participant-1",
      fingerprint: "prior-1",
      exerciseId: "exercise-1",
      action: "HINT",
      evidence: { status: "failed", summary: "private detail", source: "assert" },
      feedback: { diagnosis: "private", affectedConcepts: [], explanation: "private", confidence: 1 },
      support: { action: "HINT", source: "llm", promptVersion: "old", instruction: "private" },
      decisionPresentation: { source: "llm", promptVersion: "old", evidenceReferences: ["legacy free text"] },
      createdAt: "2026-01-01T00:00:00.000Z"
    }],
    decision: { status: "action", action: "HARDER", reasonCodes: ["MASTERY_AT_LEAST_70"], evidenceUsed: ["status:passed"], learnerAfter: { studentId: "participant-1", mastery: { accumulators: 78 } }, policy: "full_adaptive", policyVersion: "full-adaptive-v1" },
    latencyMs: 1,
    modelVersion: "not-used",
    promptVersion: "not-used"
  });
  assert.deepEqual(Object.keys(trace.history[0]).sort(), ["action", "createdAt", "evidenceSource", "evidenceStatus", "exerciseId", "fingerprint"].sort());
  assert.doesNotMatch(JSON.stringify(trace.history), /private|legacy free text/);
});
