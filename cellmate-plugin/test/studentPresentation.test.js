const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildAdaptiveStudentMarkdown,
  buildSelfStudyStudentMarkdown
} = require("../out/adaptive/studentPresentation");

const generated = {
  id: "generated:selfstudy:for_loops:1",
  origin: "generated",
  parentId: "selfstudy",
  action: "SIMILAR",
  title: "Sum a list",
  promptMarkdown: "Complete `sum_values(values)`.",
  targetConcepts: ["for_loops", "accumulators"],
  primaryConcept: "for_loops",
  difficulty: 1,
  starterCode: "def sum_values(values):\n    raise NotImplementedError",
  referenceSolution: "def sum_values(values):\n    return sum(values)",
  testCode: "assert sum_values([1, 2]) == 3",
  model: "fallback-template",
  promptVersion: "test",
  createdAt: "2026-01-01T00:00:00.000Z",
  validated: true,
  validationStatus: "fallback",
  originMode: "self_study_goal",
  learningGoal: "Practise loops"
};

test("adaptive result leads with student outcome and hides exact scores in details", () => {
  const rendered = buildAdaptiveStudentMarkdown({
    marker: "<!-- marker -->",
    action: "SIMILAR",
    evidence: {
      status: "passed",
      summary: "REFERENCE: exercise-1_2 SATISFIED: True",
      source: "pybryt",
      confidence: "high",
      hasReliableCheck: true
    },
    learner: {
      studentId: "student",
      mastery: {
        variables: 74,
        arithmetic_operations: 66
      }
    },
    targetConcepts: ["variables", "arithmetic_operations"],
    taskSpec: {
      id: "exercise-1_2",
      sourceMode: "course_verified",
      taskSummary: "Convert metric length",
      expectedBehavior: "Produce imperial units",
      title: "Length conversion",
      promptMarkdown: "",
      targetConcepts: ["variables", "arithmetic_operations"],
      primaryConcept: "arithmetic_operations",
      difficulty: 1,
      confidence: 1
    },
    courseRecommendation: {
      exerciseId: "exercise-1_3",
      title: "Compute the air resistance on a football",
      notebook: "lecture1/lecture1.ipynb",
      reason: "This is the next planned course exercise.",
      source: "next_exercises",
      generatedFallbackNeeded: false
    },
    decisionPresentation: {
      source: "llm",
      model: "gpt-4.1-mini",
      promptVersion: "llm-next-step-v5",
      reason: "A related task will consolidate the skill.",
      confidence: 0.9
    },
    feedback: {
      diagnosis: "The conversion checks passed.",
      affectedConcepts: ["arithmetic_operations"],
      explanation: "The checks confirm that your code produced the expected feet, yards, and miles values. Keep using named intermediate values so each conversion remains easy to inspect in Exercise 1.3.",
      confidence: 0.9
    }
  });

  assert.match(rendered.result, /^<!-- marker -->\n## Check passed/m);
  const visibleResult = rendered.result.split("<details>")[0];
  assert.match(visibleResult, /expected feet, yards, and miles values/);
  assert.doesNotMatch(visibleResult, /Learning progress/);
  assert.doesNotMatch(visibleResult, /\b74\b|\b66\b/);
  assert.match(rendered.result, /<summary><strong>Technical details<\/strong><\/summary>/);
  assert.match(rendered.result, /Detected context:\*\* Course exercise/);
  assert.match(rendered.nextStep, /## Next step: Practise a similar exercise/);
  assert.match(rendered.nextStep, /### Continue with Exercise 1\.3/);
  assert.match(rendered.nextStep, /Open Exercise 1\.3/);
  assert.doesNotMatch(rendered.nextStep.split("<details>")[0], /Recommended Action: SIMILAR/);
  assert.doesNotMatch(rendered.result + rendered.nextStep, /鈥|路/);
});

test("failed result renders an actionable hint instead of a generic action label", () => {
  const rendered = buildAdaptiveStudentMarkdown({
    marker: "<!-- marker -->",
    action: "HINT",
    evidence: {
      status: "failed",
      summary: "NameError: name 'A' is not defined",
      source: "runtime_error",
      confidence: "high",
      hasReliableCheck: true
    },
    learner: { studentId: "student", mastery: { variables: 48 } },
    targetConcepts: ["variables"],
    support: {
      action: "HINT",
      source: "local_fallback",
      promptVersion: "next-step-support-v1",
      instruction: "Make one focused change, then run the same check again.",
      hint: "`A` is used before it has a value. Define what it represents before that line."
    }
  });

  assert.match(rendered.nextStep, /> \*\*Hint:\*\* `A` is used before it has a value/);
  assert.match(rendered.nextStep, /run the same check again/i);
  assert.doesNotMatch(rendered.nextStep, /A\s*=/);
});

test("retry support renders ordered steps and an incomplete scaffold", () => {
  const rendered = buildAdaptiveStudentMarkdown({
    marker: "<!-- marker -->",
    action: "RETRY_WITH_SCAFFOLD",
    evidence: {
      status: "failed",
      summary: "NameError: name 'A' is not defined",
      source: "runtime_error",
      confidence: "high",
      hasReliableCheck: true
    },
    learner: { studentId: "student", mastery: { variables: 44 } },
    targetConcepts: ["variables"],
    support: {
      action: "RETRY_WITH_SCAFFOLD",
      source: "local_fallback",
      promptVersion: "next-step-support-v1",
      instruction: "Keep the task, but use these smaller steps.",
      steps: ["Find where `A` is used.", "Calculate it before that line."],
      scaffoldCode: "A = ..."
    }
  });

  assert.match(rendered.nextStep, /1\. Find where `A` is used/);
  assert.match(rendered.nextStep, /```python\nA = \.\.\.\n```/);
  assert.match(rendered.nextStep, /Fill the blank yourself/);
});

test("generated practice is primary when there is no course recommendation", () => {
  const rendered = buildAdaptiveStudentMarkdown({
    marker: "<!-- marker -->",
    action: "SIMILAR",
    evidence: {
      status: "passed",
      summary: "3 tests passed",
      source: "llm_generated_tests",
      confidence: "high",
      hasReliableCheck: true
    },
    learner: {
      studentId: "student",
      mastery: { for_loops: 58, accumulators: 58 }
    },
    generated,
    targetConcepts: ["for_loops", "accumulators"],
    generationSource: "scaffold fallback"
  });
  assert.match(rendered.generatedPractice, /## Practice task: Sum a list/);
  assert.doesNotMatch(rendered.generatedPractice, /## Optional practice/);
  assert.match(rendered.generatedPractice, /<summary><strong>Validation details<\/strong><\/summary>/);
});

test("self-study introduction keeps validation details collapsed", () => {
  const markdown = buildSelfStudyStudentMarkdown({
    generated,
    generationSource: "scaffold fallback"
  });
  assert.match(markdown, /## Self-study mini task: For Loops and Accumulators/);
  assert.match(markdown, /\*\*Your goal:\*\* Practise loops/);
  assert.match(markdown, /one short practice task/);
  assert.match(markdown, /<summary><strong>Validation details<\/strong><\/summary>/);
});
