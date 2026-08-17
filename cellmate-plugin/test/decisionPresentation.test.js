const assert = require("node:assert/strict");
const test = require("node:test");
const {
  actionExplanation,
  actionStudentLabel,
  courseExerciseDisplayId,
  createDecisionPresentation,
  decisionPresentationMarkdown,
  evidenceStudentOutcome,
  masteryBand,
  sourceModeLabel
} = require("../out/adaptive/decisionPresentation");

test("renders an honest LLM decision source with its reason and evidence", () => {
  const presentation = createDecisionPresentation({
    status: "action",
    action: "SIMILAR",
    reasonCodes: ["LLM_SELECTED"],
    evidenceUsed: ["status:passed"],
    learnerAfter: { studentId: "student", mastery: { for_loops: 58 } },
    policy: "llm_adaptive",
    policyVersion: "llm-next-step-v1",
    selectionExplanation: "One comparable task will confirm the skill.",
    selectionConfidence: 0.74,
    selectionEvidenceReferences: ["check:current", "mastery:for_loops"],
    fallbackUsed: false
  }, "gpt-4.1-mini");

  const markdown = decisionPresentationMarkdown(presentation);
  assert.match(markdown, /Selected by: \*\*LLM \(gpt-4\.1-mini\)\*\*/);
  assert.match(markdown, /Why this action: One comparable task will confirm the skill\./);
  assert.match(markdown, /Selection confidence: 74%/);
  assert.match(markdown, /- `check:current`/);
});

test("renders rule backup without claiming that the LLM selected the action", () => {
  const presentation = createDecisionPresentation({
    status: "action",
    action: "RETRY_WITH_SCAFFOLD",
    reasonCodes: ["LLM_INVALID_FALLBACK", "FIRST_RELIABLE_FAILURE"],
    evidenceUsed: ["status:failed"],
    learnerAfter: { studentId: "student", mastery: { for_loops: 44 } },
    policy: "llm_adaptive",
    policyVersion: "llm-next-step-v1",
    fallbackUsed: true
  }, "gpt-4.1-mini");

  const markdown = decisionPresentationMarkdown(presentation);
  assert.match(markdown, /Selected by: \*\*rule-based backup\*\*/);
  assert.match(markdown, /did not return a valid, evidence-consistent action/);
  assert.doesNotMatch(markdown, /Selected by: \*\*LLM/);
});

test("HINT describes conceptual support rather than missing evidence", () => {
  const explanation = actionExplanation("HINT", false);
  assert.match(explanation, /small clue/);
  assert.doesNotMatch(explanation, /run.*check/i);
});

test("student-facing action labels use plain language instead of policy enums", () => {
  assert.equal(actionStudentLabel("HINT"), "Get a small hint");
  assert.equal(actionStudentLabel("RETRY_WITH_SCAFFOLD"), "Try again with step-by-step support");
  assert.equal(actionStudentLabel("EASIER"), "Start with a simpler exercise");
  assert.equal(actionStudentLabel("SIMILAR"), "Practise a similar exercise");
  assert.equal(actionStudentLabel("HARDER"), "Try a harder exercise");
  assert.equal(actionStudentLabel("NEXT_CONCEPT"), "Move to the next topic");
});

test("student-facing metadata uses readable labels and progress bands", () => {
  assert.equal(sourceModeLabel("course_verified"), "Course exercise");
  assert.equal(courseExerciseDisplayId("exercise-1_3"), "Exercise 1.3");
  assert.equal(masteryBand(50), "starting");
  assert.equal(masteryBand(58), "developing");
  assert.equal(masteryBand(74), "making good progress");
  assert.equal(masteryBand(90), "strong");
  assert.deepEqual(
    evidenceStudentOutcome({ status: "passed", summary: "ok" }),
    {
      heading: "Check passed",
      message: "Your latest exercise check passed."
    }
  );
});
