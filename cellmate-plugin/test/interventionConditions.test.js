const assert = require("node:assert/strict");
const test = require("node:test");
const { createIntervention } = require("../out-evaluation/evaluation/interventionConditions");

test("learning-consequence conditions share feedback and vary only the next step", async () => {
  const feedback = "Your loop runs, but the accumulator is overwritten on each iteration.";
  const input = decisionInput();
  const llmEngine = {
    async decide() {
      return {
        status: "action",
        action: "HINT",
        reasonCodes: ["LLM_SELECTED"],
        evidenceUsed: ["status:failed"],
        learnerAfter: input.learnerBefore,
        policy: "llm_adaptive",
        policyVersion: "llm-next-step-v1",
        selectionExplanation: "A targeted hint is sufficient for this local error.",
        selectionConfidence: 0.8,
        selectionEvidenceReferences: ["failed accumulator check"],
        fallbackUsed: false
      };
    }
  };
  const feedbackOnly = await createIntervention("feedback_only", feedback, input);
  const fixed = await createIntervention("fixed_next_step", feedback, input);
  const ruleAdaptive = await createIntervention("rule_adaptive_next_step", feedback, input);
  const llmAdaptive = await createIntervention("llm_adaptive_next_step", feedback, input, llmEngine);

  assert.equal(feedbackOnly.feedback, feedback);
  assert.equal(fixed.feedback, feedback);
  assert.equal(ruleAdaptive.feedback, feedback);
  assert.equal(llmAdaptive.feedback, feedback);
  assert.equal("nextStep" in feedbackOnly, false);
  assert.ok(fixed.nextStep);
  assert.ok(ruleAdaptive.nextStep);
  assert.ok(llmAdaptive.nextStep);
  assert.equal(fixed.nextStep.policy, "fixed");
  assert.equal(ruleAdaptive.nextStep.policy, "full_adaptive");
  assert.equal(llmAdaptive.nextStep.policy, "llm_adaptive");
});

test("LLM evaluation condition requires an explicit versioned engine", async () => {
  await assert.rejects(
    createIntervention("llm_adaptive_next_step", "shared feedback", decisionInput()),
    /requires an injected/
  );
});

function decisionInput() {
  return {
    taskSpec: {
      id: "evaluation:accumulator",
      sourceMode: "generic_llm",
      taskSummary: "Sum a list with a running total",
      expectedBehavior: "Return the sum of all values",
      title: "Running total",
      promptMarkdown: "Use a for loop and an accumulator.",
      targetConcepts: ["for_loops", "accumulators"],
      primaryConcept: "accumulators",
      difficulty: 1,
      confidence: 1
    },
    evidence: {
      status: "failed",
      summary: "Expected 6, received 3",
      source: "visible_assert",
      confidence: "high",
      hasReliableCheck: true
    },
    learnerBefore: {
      studentId: "participant-test",
      mastery: { for_loops: 45, accumulators: 40 },
      updatedAt: "2026-07-15T00:00:00.000Z"
    },
    history: []
  };
}
