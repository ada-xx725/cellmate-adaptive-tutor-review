const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildFeedbackPrompt,
  fallbackFeedback,
  FEEDBACK_PROMPT_VERSION
} = require("../out/adaptive/feedbackGuidance");

const taskSpec = {
  id: "exercise-1_2",
  sourceMode: "course_verified",
  taskSummary: "Convert metres to British length units",
  expectedBehavior: "Calculate feet, yards, and miles",
  targetConcepts: ["variables", "arithmetic_operations", "unit_conversion", "sequential_assignment"],
  primaryConcept: "arithmetic_operations",
  difficulty: 1,
  confidence: 0.95
};

const evidence = {
  status: "passed",
  source: "pybryt",
  confidence: "high",
  hasReliableCheck: true,
  summary: [
    "REFERENCE: exercise-1_2",
    "SATISFIED: True",
    "  - SUCCESS: Your conversion to feet is correct. Well done!",
    "  - SUCCESS: Your calculation of yards is correct.",
    "  - SUCCESS: Your conversion to miles is right."
  ].join("\n")
};

test("feedback v3 separates diagnosis from the action-specific support section", () => {
  const prompt = buildFeedbackPrompt({
    taskSpec,
    evidence,
    learner: { studentId: "test", mastery: {} },
    action: "HARDER",
    studentCode: "feet = metres / 0.3048"
  });

  assert.equal(FEEDBACK_PROMPT_VERSION, "adaptive-feedback-v3");
  assert.match(prompt, /never infer mastery/i);
  assert.match(prompt, /reusable programming method/i);
  assert.match(prompt, /what to carry into the recommended next step/i);
  assert.match(prompt, /distinguish verified test evidence from observations/i);
  assert.match(prompt, /do not give a formula, code correction, steps, hint/i);
  assert.match(prompt, /separate next-step section/i);
});

test("fallback pass feedback names verified behaviour and a reusable method", () => {
  const feedback = fallbackFeedback(taskSpec, evidence, "HARDER");

  assert.match(feedback.explanation, /feet/i);
  assert.match(feedback.explanation, /yards/i);
  assert.match(feedback.explanation, /miles/i);
  assert.match(feedback.explanation, /named intermediate steps/i);
  assert.doesNotMatch(feedback.explanation, /solid grasp|mastered/i);
});
