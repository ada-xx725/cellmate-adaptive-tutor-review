const assert = require("node:assert/strict");
const test = require("node:test");
const { extractAdaptiveExerciseId } = require("../out/adaptive/adaptiveExerciseId");
const { PythonValidator } = require("../out/adaptive/pythonValidator");
const {
  assessNotebookTaskIntent,
  fallbackTaskSpecFromGoal,
  notebookContextLooksUnresolved,
  selfStudyCandidateForTask,
  selfStudyWasConfirmed,
  shouldOfferSelfStudyFallback,
  toSelfStudyGeneratedExercise
} = require("../out/adaptive/selfStudyTemplates");
const { GoalToTaskSpecAgent } = require("../out/adaptive/goalToTaskSpecAgent");

test("resolver helper recognises selfstudy exercise IDs", () => {
  const code = "# EXERCISE_ID: selfstudy:accumulators:abc-123\n# TARGET_CONCEPTS: for_loops, accumulators\n";
  assert.equal(extractAdaptiveExerciseId(code), "selfstudy:accumulators:abc-123");
});

function context(overrides = {}) {
  return {
    notebookUri: "untitled:Untitled-1.ipynb",
    cellIndex: 0,
    currentCode: "",
    currentOutput: "",
    beforeMarkdown: [],
    afterMarkdown: [],
    nearbyCode: [],
    nearbyOutputs: [],
    nearbyCodeCells: [],
    ...overrides
  };
}

test("code without an explicit task remains unresolved before generic LLM inference", () => {
  const result = assessNotebookTaskIntent(context({
    currentCode: "def solve(values):\n    return values\n",
    currentOutput: "successfully loaded data",
    nearbyCode: ["assert solve([]) == []"],
    nearbyOutputs: ["1 passed"]
  }));
  assert.deepEqual(result, { status: "needs_evidence", reason: "missing_task_intent" });
  assert.equal(notebookContextLooksUnresolved(context({ currentCode: "print('hello')" })), true);
});

test("explicit task markers and task-like Markdown ground notebook intent", () => {
  assert.deepEqual(
    assessNotebookTaskIntent(context({ currentCode: "# TASK: Return the doubled value\ndef double(value):\n    return value" })),
    { status: "grounded", source: "explicit_marker", statement: "Return the doubled value" }
  );
  assert.deepEqual(
    assessNotebookTaskIntent(context({ beforeMarkdown: ["Write a function that returns the factorial of n."] })),
    { status: "grounded", source: "explicit_markdown", statement: "Write a function that returns the factorial of n." }
  );
});

test("background explanation without a task cue remains unresolved", () => {
  assert.equal(notebookContextLooksUnresolved(context({
    beforeMarkdown: ["A list stores multiple values in order."],
    currentCode: "values = [1, 2, 3]"
  })), true);
});

test("previous adaptive output does not count as reliable notebook context", () => {
  assert.equal(notebookContextLooksUnresolved(context({
    currentCode: "# just a comment",
    afterMarkdown: ["<!-- cellmate-adaptive: source-cell=0 -->\n## Adaptive Next Step\nWrite another function"]
  })), true);
});

test("low-confidence generic context triggers self-study fallback decision", () => {
  assert.equal(shouldOfferSelfStudyFallback({ sourceMode: "generic_llm", confidence: 0.35 }), true);
  assert.equal(shouldOfferSelfStudyFallback({ sourceMode: "generic_llm", confidence: 0.7 }), false);
  assert.equal(shouldOfferSelfStudyFallback({ sourceMode: "course_verified", confidence: 0.2 }), false);
});

test("cancelled self-study prompt is treated as no-op", () => {
  assert.equal(selfStudyWasConfirmed(undefined), false);
  assert.equal(selfStudyWasConfirmed("Cancel"), false);
  assert.equal(selfStudyWasConfirmed("Start from goal"), true);
});

test("invalid LLM task spec falls back to local self-study template", async () => {
  const agent = new GoalToTaskSpecAgent({ completeJson: async () => ({ invalid: true }) });
  const spec = await agent.infer("I want to practise for loops and accumulators");
  assert.equal(spec.sourceMode, "self_study_goal");
  assert.equal(spec.primaryConcept, "accumulators");
  assert.ok(spec.targetConcepts.includes("for_loops"));
});

test("self-study fallback template passes generated exercise validation", async () => {
  const validator = new PythonValidator();
  const taskSpec = fallbackTaskSpecFromGoal("I want to practise for loops and accumulators");
  const candidate = selfStudyCandidateForTask(taskSpec);
  const generated = toSelfStudyGeneratedExercise(taskSpec, candidate, "test-uuid");
  const validation = await validator.validateDetailed(generated, "python");
  assert.equal(generated.id, "selfstudy:accumulators:test-uuid");
  assert.equal(generated.primaryConcept, "accumulators");
  assert.deepEqual(generated.targetConcepts, ["for_loops", "accumulators", "variables"]);
  assert.equal(generated.originMode, "self_study_goal");
  assert.match(generated.promptMarkdown, /sum of all numbers/i);
  assert.doesNotMatch(generated.promptMarkdown, /less than 10/i);
  assert.match(generated.referenceSolution, /total \+= value/);
  assert.equal(validation.referencePassed, true);
  assert.equal(validation.starterFailed, true);
  assert.equal(validation.negativeFailed, true);
  assert.equal(validation.ok, true);
});
