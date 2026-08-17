const assert = require("node:assert/strict");
const test = require("node:test");
const {
  NEXT_STEP_SUPPORT_PROMPT_VERSION,
  NextStepSupportAgent,
  buildNextStepSupportPrompt
} = require("../out/adaptive/nextStepSupport");

test("creates one concise hint for a local first error without exposing solution code", async () => {
  const agent = new NextStepSupportAgent(completer({
    instruction: "Fix the first missing value, then rerun the check.",
    hint: "A is used before it has a value. Look for the quantity that A represents."
  }));

  const support = await agent.generate(input("HINT"));
  assert.equal(support.action, "HINT");
  assert.equal(support.source, "llm");
  assert.match(support.hint, /used before it has a value/);
  assert.equal(support.steps, undefined);
  assert.equal(support.scaffoldCode, undefined);
});

test("rejects a hint containing a direct assignment and uses a safe local fallback", async () => {
  const agent = new NextStepSupportAgent(completer({
    instruction: "Use the circle area.",
    hint: "A = 3.14159 * radius ** 2"
  }));

  const support = await agent.generate(input("HINT"));
  assert.equal(support.source, "local_fallback");
  assert.match(support.hint, /`A` is being used before it has a value/);
  assert.doesNotMatch(support.hint, /\bA\s*=/);
});

test("creates ordered retry support with an incomplete code scaffold", async () => {
  const agent = new NextStepSupportAgent(completer({
    instruction: "Complete the calculation in smaller steps.",
    steps: [
      "Identify what A represents.",
      "Calculate A before the drag-force expression.",
      "Run the same check again."
    ],
    scaffold_code: "A = ...\n# keep the existing drag-force line below"
  }));

  const support = await agent.generate(input("RETRY_WITH_SCAFFOLD"));
  assert.equal(support.action, "RETRY_WITH_SCAFFOLD");
  assert.equal(support.source, "llm");
  assert.equal(support.steps.length, 3);
  assert.match(support.scaffoldCode, /\.\.\./);
});

test("rejects a complete scaffold and falls back to one with a visible blank", async () => {
  const agent = new NextStepSupportAgent(completer({
    instruction: "Use these steps.",
    steps: ["Calculate the area.", "Use it in the force expression."],
    scaffold_code: "A = 3.14159 * radius ** 2"
  }));

  const support = await agent.generate(input("RETRY_WITH_SCAFFOLD"));
  assert.equal(support.source, "local_fallback");
  assert.match(support.scaffoldCode, /A = \.\.\./);
  assert.ok(support.steps.length >= 2);
});

test("support prompt fixes different content contracts for hint and scaffold", () => {
  const hintPrompt = buildNextStepSupportPrompt(input("HINT"));
  const scaffoldPrompt = buildNextStepSupportPrompt(input("RETRY_WITH_SCAFFOLD"));
  assert.match(hintPrompt, new RegExp(NEXT_STEP_SUPPORT_PROMPT_VERSION));
  assert.match(hintPrompt, /one targeted clue/);
  assert.match(hintPrompt, /Do not return steps or scaffold_code/);
  assert.match(scaffoldPrompt, /2 to 4 short ordered items/);
  assert.match(scaffoldPrompt, /must contain an obvious placeholder/);
});

function completer(value) {
  return { completeJson: async () => value };
}

function input(action) {
  return {
    action,
    taskSpec: {
      id: "exercise-1_3",
      sourceMode: "course_verified",
      taskSummary: "Compute the air resistance on a football.",
      expectedBehavior: "Calculate the drag force from the intermediate values.",
      title: "Air resistance",
      promptMarkdown: "Calculate the cross-sectional area A before the drag force.",
      targetConcepts: ["variables", "compound_expressions"],
      primaryConcept: "compound_expressions",
      difficulty: 1,
      confidence: 1
    },
    evidence: {
      status: "failed",
      summary: "NameError: name 'A' is not defined",
      source: "runtime_error",
      confidence: "high",
      hasReliableCheck: true
    },
    studentCode: "drag_force = 0.5 * density * velocity ** 2 * A",
    feedback: {
      diagnosis: "A is undefined.",
      affectedConcepts: ["variables"],
      explanation: "The drag-force line uses A before it is assigned.",
      confidence: 0.9
    }
  };
}
