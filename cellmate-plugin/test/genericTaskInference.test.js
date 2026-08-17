const assert = require("node:assert/strict");
const test = require("node:test");
const { GenericTaskInferer } = require("../out/adaptive/genericTaskInferer");

test("generic task inference falls back to notebook context when no LLM is configured", async () => {
  const inferer = new GenericTaskInferer({ completeJson: async () => undefined });
  const context = {
    notebookUri: "file:///demo.ipynb",
    cellIndex: 1,
    currentCode: "def sum_positive(values):\n    return 0\n",
    currentOutput: "",
    beforeMarkdown: ["Write a function that returns the sum of positive numbers in a list."],
    afterMarkdown: [],
    nearbyCode: [],
    nearbyOutputs: [],
    nearbyCodeCells: []
  };
  const task = "Write a function that returns the sum of positive numbers in a list.";
  const spec = await inferer.infer(context, task);
  assert.equal(spec.sourceMode, "generic_llm");
  assert.equal(spec.expectedFunction, "sum_positive");
  assert.equal(spec.expectedBehavior, task);
  assert.equal(spec.confidence, 0.7);
  assert.equal(spec.generatedTests, undefined);
  assert.ok(spec.targetConcepts.includes("functions"));
  assert.ok(spec.targetConcepts.includes("lists"));
});

test("generic task inference rejects missing intent without calling the LLM", async () => {
  let calls = 0;
  const inferer = new GenericTaskInferer({ completeJson: async () => { calls += 1; return undefined; } });
  await assert.rejects(
    inferer.infer({
      notebookUri: "file:///demo.ipynb",
      cellIndex: 1,
      currentCode: "def solve(value):\n    return value\n",
      currentOutput: "",
      beforeMarkdown: [],
      afterMarkdown: [],
      nearbyCode: [],
      nearbyOutputs: [],
      nearbyCodeCells: []
    }, "   "),
    /Explicit task intent is required/
  );
  assert.equal(calls, 0);
});
