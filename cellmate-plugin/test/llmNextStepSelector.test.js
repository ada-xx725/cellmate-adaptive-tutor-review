const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LlmNextStepSelector,
  buildDecisionEvidenceCatalog,
  buildLlmNextStepPrompt,
  LLM_NEXT_STEP_PROMPT_VERSION
} = require("../out/adaptive/llmNextStepSelector");

test("accepts one valid action from the fixed next-step vocabulary", async () => {
  const selector = new LlmNextStepSelector(completer({
    action: "SIMILAR",
    reason: "The current check passed, but mastery is still developing.",
    evidence_reference_ids: ["check:current", "mastery:for_loops"],
    confidence: 0.78
  }));

  const selected = await selector.select(input());
  assert.deepEqual(selected, {
    action: "SIMILAR",
    reason: "The current check passed, but mastery is still developing.",
    evidenceReferences: ["check:current", "mastery:for_loops"],
    confidence: 0.78
  });
});

test("rejects unknown actions and malformed responses", async () => {
  const selector = new LlmNextStepSelector(completer({
    action: "WATCH_A_VIDEO",
    reason: "Try something else.",
    evidence_reference_ids: ["check:current"],
    confidence: 0.8
  }));
  assert.equal(await selector.select(input()), undefined);
});

test("rejects a next-concept suggestion after a failed check", async () => {
  const selector = new LlmNextStepSelector(completer({
    action: "NEXT_CONCEPT",
    reason: "Move on.",
    evidence_reference_ids: ["check:current"],
    confidence: 0.9
  }));
  assert.equal(await selector.select(input({ evidence: failedEvidence() })), undefined);
});

test("rejects harder and next-concept suggestions when passed mastery is below 70", async () => {
  for (const action of ["HARDER", "NEXT_CONCEPT"]) {
    const selector = new LlmNextStepSelector(completer({
      action,
      reason: "Move forward after this pass.",
      evidence_reference_ids: ["check:current", "mastery:for_loops"],
      confidence: 0.9
    }));
    assert.equal(await selector.select(input()), undefined);
  }
});

test("rejects remedial actions after a reliable passed check", async () => {
  for (const action of ["HINT", "RETRY_WITH_SCAFFOLD", "EASIER"]) {
    const selector = new LlmNextStepSelector(completer({
      action,
      reason: "Move backwards after this pass.",
      evidence_reference_ids: ["check:current"],
      confidence: 0.9
    }));
    assert.equal(await selector.select(input()), undefined);
  }
});

test("allows harder but rejects next-concept when passed mastery is between 70 and 85", async () => {
  const learnerBefore = { studentId: "student", mastery: { for_loops: 76, accumulators: 76 } };
  const harder = new LlmNextStepSelector(completer({
    action: "HARDER",
    reason: "The learner is ready for one additional challenge.",
    evidence_reference_ids: ["check:current", "mastery:for_loops"],
    confidence: 0.8
  }));
  const nextConcept = new LlmNextStepSelector(completer({
    action: "NEXT_CONCEPT",
    reason: "Move to a new concept.",
    evidence_reference_ids: ["check:current", "mastery:for_loops", "course:exercise-test"],
    confidence: 0.8
  }));

  assert.equal((await harder.select(input({ learnerBefore }))).action, "HARDER");
  assert.equal(await nextConcept.select(input({ learnerBefore })), undefined);
});

test("allows next-concept when passed mastery is at least 85", async () => {
  const selector = new LlmNextStepSelector(completer({
    action: "NEXT_CONCEPT",
    reason: "Mastery is high and the current task passed.",
    evidence_reference_ids: ["check:current", "mastery:for_loops", "course:exercise-test"],
    confidence: 0.9
  }));
  const learnerBefore = { studentId: "student", mastery: { for_loops: 90, accumulators: 90 } };

  assert.equal((await selector.select(input({ learnerBefore }))).action, "NEXT_CONCEPT");
});

test("asks the LLM once more when the first action violates a progression constraint", async () => {
  let calls = 0;
  const responses = [
    {
      action: "NEXT_CONCEPT",
      reason: "The current check passed.",
      evidence_reference_ids: ["check:current", "mastery:for_loops", "course:exercise-test"],
      confidence: 0.9
    },
    {
      action: "SIMILAR",
      reason: "The check passed, but mastery is still developing.",
      evidence_reference_ids: ["check:current", "mastery:for_loops"],
      confidence: 0.82
    }
  ];
  const selector = new LlmNextStepSelector({
    async completeJson() {
      return responses[calls++];
    }
  });

  assert.equal((await selector.select(input())).action, "SIMILAR");
  assert.equal(calls, 2);
});

test("does not call the LLM when evidence is insufficient", async () => {
  let calls = 0;
  const selector = new LlmNextStepSelector({
    async completeJson() {
      calls += 1;
      return {
        action: "HINT",
        reason: "Run the check.",
        evidence_reference_ids: [],
        confidence: 0.5
      };
    }
  });

  const selected = await selector.select(input({
    evidence: {
      status: "not_run",
      summary: "No check output",
      source: "none",
      confidence: "low",
      hasReliableCheck: false
    }
  }));
  assert.equal(selected, undefined);
  assert.equal(calls, 0);
});

test("prompt contains the versioned task, evidence, learner, history, and course context", () => {
  const prompt = buildLlmNextStepPrompt(input({ history: [priorAttempt()] }));
  assert.match(prompt, new RegExp(LLM_NEXT_STEP_PROMPT_VERSION));
  assert.match(prompt, /Return the total/);
  assert.match(prompt, /"status":"passed"/);
  assert.match(prompt, /"for_loops":58/);
  assert.match(prompt, /exercise-prior/);
  assert.match(prompt, /exercise-next/);
  assert.match(prompt, /HINT\|RETRY_WITH_SCAFFOLD\|EASIER\|SIMILAR\|HARDER\|NEXT_CONCEPT/);
  assert.match(prompt, /Average mastery below 70/);
  assert.match(prompt, /One successful attempt does not by itself prove/);
  assert.match(prompt, /A passed current task must not produce HINT, RETRY_WITH_SCAFFOLD, or EASIER/);
  assert.match(prompt, /single local error normally needs HINT first/);
  assert.match(prompt, /previous HINT did not resolve/);
  assert.match(prompt, /support on the current task has already failed/);
  assert.match(prompt, /Allowed actions for this input.*SIMILAR/);
  assert.doesNotMatch(
    prompt.match(/Allowed actions for this input.*$/m)?.[0] ?? "",
    /HINT|RETRY_WITH_SCAFFOLD|EASIER/
  );
  assert.match(prompt, /evidence_reference_ids/);
  assert.match(prompt, /check:current/);
  assert.match(prompt, /mastery:for_loops/);
  assert.match(prompt, /history:prior/);
  assert.match(prompt, /course:exercise-test/);
});

test("evidence catalog values are derived from the supplied decision input", () => {
  const catalog = buildDecisionEvidenceCatalog(input({ history: [priorAttempt()] }));
  assert.deepEqual(catalog.map((entry) => entry.id), [
    "check:current",
    "mastery:for_loops",
    "mastery:accumulators",
    "history:prior",
    "course:exercise-test"
  ]);
  assert.match(catalog.find((entry) => entry.id === "check:current").value, /All assertions passed/);
  assert.equal(catalog.find((entry) => entry.id === "mastery:for_loops").value, "58");
});

test("repairs unknown evidence IDs once and accepts only grounded IDs", async () => {
  let calls = 0;
  const responses = [
    {
      action: "SIMILAR",
      reason: "Use an invented reference.",
      evidence_reference_ids: ["check:current", "history:not-real"],
      confidence: 0.8
    },
    {
      action: "SIMILAR",
      reason: "The current check passed while mastery remains developing.",
      evidence_reference_ids: ["check:current", "mastery:for_loops"],
      confidence: 0.8
    }
  ];
  const selector = new LlmNextStepSelector({ completeJson: async () => responses[calls++] });
  const selected = await selector.select(input());
  assert.deepEqual(selected.evidenceReferences, ["check:current", "mastery:for_loops"]);
  assert.equal(calls, 2);
});

test("rejects empty, duplicate, overlong, and newline evidence ID lists", async () => {
  const invalidLists = [
    [],
    ["check:current", "check:current"],
    ["check:current", "mastery:for_loops", "mastery:accumulators", "course:exercise-test", "history:a", "history:b"],
    ["check:current\ncourse:exercise-test"]
  ];
  for (const evidence_reference_ids of invalidLists) {
    const selector = new LlmNextStepSelector(completer({
      action: "SIMILAR",
      reason: "Invalid grounding.",
      evidence_reference_ids,
      confidence: 0.8
    }));
    assert.equal(await selector.select(input()), undefined);
  }
});

function completer(value) {
  return { completeJson: async () => value };
}

function input(overrides = {}) {
  return {
    taskSpec: {
      id: "exercise-test",
      sourceMode: "course_verified",
      taskSummary: "Use a for loop to calculate a running total.",
      expectedBehavior: "Return the total.",
      title: "Loop total",
      promptMarkdown: "",
      targetConcepts: ["for_loops", "accumulators"],
      primaryConcept: "for_loops",
      difficulty: 1,
      confidence: 1
    },
    evidence: passedEvidence(),
    learnerBefore: { studentId: "student", mastery: { for_loops: 58, accumulators: 58 } },
    history: [],
    courseContext: {
      exerciseId: "exercise-test",
      difficulty: 1,
      nextExercises: ["exercise-next"],
      nextConcepts: ["conditionals"]
    },
    ...overrides
  };
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

function failedEvidence() {
  return {
    status: "failed",
    summary: "AssertionError",
    source: "assert",
    confidence: "high",
    hasReliableCheck: true
  };
}

function priorAttempt() {
  return {
    participantId: "student",
    fingerprint: "prior",
    exerciseId: "exercise-prior",
    action: "RETRY_WITH_SCAFFOLD",
    evidence: failedEvidence(),
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}
