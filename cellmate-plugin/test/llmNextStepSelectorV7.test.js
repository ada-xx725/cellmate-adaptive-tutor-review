const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildConstrainedDecisionEvidenceCatalog,
  buildLlmNextStepPromptV7,
  LLM_NEXT_STEP_PROMPT_VERSION_V7,
  LlmNextStepSelectorV7
} = require("../out/adaptive/llmNextStepSelectorV7");

test("accepts only a grounded action inside the executable v7 mask", async () => {
  const selector = new LlmNextStepSelectorV7(completer({
    action: "HARDER",
    reason: "The broad check passed and mastery is solid.",
    evidence_reference_ids: ["check:current", "mastery:for_loops"],
    confidence: 0.82
  }));
  const selected = await selector.select(input({ learnerBefore: learner(76) }));
  assert.equal(selected.action, "HARDER");
  assert.deepEqual(selected.evidenceReferences, ["check:current", "mastery:for_loops"]);
});

test("repairs a masked next-concept action when no course target exists", async () => {
  let calls = 0;
  const responses = [
    selection("NEXT_CONCEPT", ["check:current", "mastery:for_loops", "course:exercise-test"]),
    selection("HARDER", ["check:current", "mastery:for_loops"])
  ];
  const selector = new LlmNextStepSelectorV7({ completeJson: async () => responses[calls++] });
  const selected = await selector.select(input({
    learnerBefore: learner(90),
    history: successfulHistory(),
    courseContext: { exerciseId: "exercise-test", nextConcepts: [] }
  }));
  assert.equal(selected.action, "HARDER");
  assert.equal(calls, 2);
});

test("requires narrow-coverage provenance and rejects progression", async () => {
  let calls = 0;
  const responses = [
    selection("HARDER", ["check:current", "mastery:for_loops"]),
    selection("SIMILAR", ["check:current", "coverage:current"])
  ];
  const selector = new LlmNextStepSelectorV7({ completeJson: async () => responses[calls++] });
  const selected = await selector.select(input({
    learnerBefore: learner(90),
    history: successfulHistory(),
    evidence: passedEvidence({
      coverage: { scope: "narrow", passedChecks: 1, totalChecks: 1, notCovered: ["empty input"] }
    })
  }));
  assert.equal(selected.action, "SIMILAR");
  assert.deepEqual(selected.evidenceReferences, ["check:current", "coverage:current"]);
});

test("requires history provenance when responding to failed prior support", async () => {
  const prior = attempt("HINT", "failed", "prior-hint", "2026-01-01");
  let calls = 0;
  const responses = [
    selection("RETRY_WITH_SCAFFOLD", ["check:current"]),
    selection("RETRY_WITH_SCAFFOLD", ["check:current", "history:prior-hint"])
  ];
  const selector = new LlmNextStepSelectorV7({ completeJson: async () => responses[calls++] });
  const selected = await selector.select(input({ evidence: failedEvidence(), history: [prior] }));
  assert.deepEqual(selected.evidenceReferences, ["check:current", "history:prior-hint"]);
  assert.equal(calls, 2);
});

test("does not call the model when evidence is insufficient", async () => {
  let calls = 0;
  const selector = new LlmNextStepSelectorV7({ completeJson: async () => { calls += 1; } });
  const selected = await selector.select(input({
    evidence: { status: "not_run", summary: "No explicit check", source: "none", confidence: "low", hasReliableCheck: false }
  }));
  assert.equal(selected, undefined);
  assert.equal(calls, 0);
});

test("canonical prompt and catalog are stable across concept and history order", () => {
  const older = attempt("SIMILAR", "passed", "older", "2026-01-01");
  const newer = attempt("HARDER", "passed", "newer", "2026-01-02");
  const first = input({ history: [older, newer] });
  const second = input({
    taskSpec: { ...taskSpec(), targetConcepts: ["accumulator", "loops"] },
    history: [newer, older]
  });
  assert.equal(buildLlmNextStepPromptV7(first), buildLlmNextStepPromptV7(second));
  assert.deepEqual(buildConstrainedDecisionEvidenceCatalog(first), buildConstrainedDecisionEvidenceCatalog(second));
  assert.match(buildLlmNextStepPromptV7(first), new RegExp(LLM_NEXT_STEP_PROMPT_VERSION_V7));
});

function completer(value) {
  return { completeJson: async () => value };
}

function selection(action, evidence_reference_ids) {
  return { action, reason: `Select ${action}.`, evidence_reference_ids, confidence: 0.8 };
}

function input(overrides = {}) {
  return {
    taskSpec: taskSpec(),
    evidence: passedEvidence(),
    learnerBefore: learner(58),
    history: [],
    courseContext: { exerciseId: "exercise-test", nextConcepts: ["conditionals"] },
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "exercise-test",
    sourceMode: "course_verified",
    taskSummary: "Use a loop to calculate a running total.",
    expectedBehavior: "Return the total.",
    title: "Loop total",
    promptMarkdown: "",
    targetConcepts: ["for_loops", "accumulators"],
    primaryConcept: "for_loops",
    difficulty: 1,
    confidence: 1
  };
}

function learner(score) {
  return { studentId: "student", mastery: { for_loops: score, accumulators: score } };
}

function passedEvidence(overrides = {}) {
  return { status: "passed", summary: "All checks passed.", source: "assert", confidence: "high", hasReliableCheck: true, ...overrides };
}

function failedEvidence() {
  return { status: "failed", summary: "The explicit check failed.", source: "assert", confidence: "high", hasReliableCheck: true };
}

function successfulHistory() {
  return [attempt("SIMILAR", "passed", "pass-1", "2026-01-01"), attempt("HARDER", "passed", "pass-2", "2026-01-02")];
}

function attempt(action, status, fingerprint, date) {
  return {
    participantId: "student",
    fingerprint,
    exerciseId: "exercise-test",
    action,
    evidence: status === "passed" ? passedEvidence() : failedEvidence(),
    taskSpec: taskSpec(),
    createdAt: `${date}T00:00:00.000Z`
  };
}
