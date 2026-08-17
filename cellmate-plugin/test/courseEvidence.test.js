const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyCourseCheckOutput } = require("../out/adaptive/courseCheckParser");
const { EvidenceExtractor } = require("../out/adaptive/evidenceExtractor");

test("PyBryt SATISFIED false is treated as failed evidence", () => {
  const evidence = classifyCourseCheckOutput("REFERENCE: exercise-1_2\nSATISFIED: False\nMESSAGES:\n- missing yards");
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.hasReliableCheck, true);
});

test("PyBryt satisfied true and success output are treated as passed evidence", () => {
  assert.equal(classifyCourseCheckOutput("REFERENCE: exercise-1_2\nSATISFIED: True").status, "passed");
  assert.equal(classifyCourseCheckOutput("SUCCESS: Your conversion is correct.").status, "passed");
});

test("unknown non-empty PyBryt output is unavailable rather than passed", () => {
  const evidence = classifyCourseCheckOutput("warning: stale cache");
  assert.equal(evidence.status, "unavailable");
  assert.equal(evidence.hasReliableCheck, false);
  assert.equal(evidence.confidence, "low");
});

test("assert checks require execution success and can pass without output", () => {
  assert.equal(classifyCourseCheckOutput("", "assert", true).status, "passed");
  assert.equal(classifyCourseCheckOutput("", "assert").status, "not_run");
  assert.equal(classifyCourseCheckOutput("", "assert", false).status, "failed");
});

test("pytest and unittest require explicit framework results", () => {
  assert.equal(classifyCourseCheckOutput("2 passed in 0.03s", "pytest", true).status, "passed");
  assert.equal(classifyCourseCheckOutput("1 failed, 1 passed", "pytest", false).status, "failed");
  assert.equal(classifyCourseCheckOutput("Ran 2 tests in 0.01s\n\nOK", "pytest", true).status, "passed");
  assert.equal(classifyCourseCheckOutput("", "pytest", true).status, "not_run");
});

test("current-cell runtime errors are collected as evidence", async () => {
  const extractor = new EvidenceExtractor({ run: async () => { throw new Error("validator should not run"); } });
  const evidence = await extractor.collectGenericEvidence({
    context: context({ currentOutput: "Traceback (most recent call last):\nNameError: missing" }),
    taskSpec: taskSpec(),
    pythonPath: "python"
  });
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.source, "runtime_error");
});

test("a failed cell execution is evidence even when it produced no text", async () => {
  const extractor = new EvidenceExtractor({ run: async () => { throw new Error("validator should not run"); } });
  const evidence = await extractor.collectGenericEvidence({
    context: context({ currentOutput: "", currentExecutionSuccess: false }),
    taskSpec: taskSpec(),
    pythonPath: "python"
  });
  assert.equal(evidence.status, "failed");
  assert.equal(evidence.confidence, "high");
});

test("ordinary success text is not accepted as pass evidence", async () => {
  const extractor = new EvidenceExtractor({ run: async () => { throw new Error("validator should not run"); } });
  const evidence = await extractor.collectGenericEvidence({
    context: context({ currentOutput: "Data loaded successfully", currentExecutionSuccess: true }),
    taskSpec: taskSpec(),
    pythonPath: "python"
  });
  assert.equal(evidence.status, "unavailable");
  assert.equal(evidence.hasReliableCheck, false);
});

test("error-like printed text is not treated as a runtime failure", async () => {
  const extractor = new EvidenceExtractor({ run: async () => { throw new Error("validator should not run"); } });
  const evidence = await extractor.collectGenericEvidence({
    context: context({ currentOutput: "ValueError is a Python exception type", currentExecutionSuccess: true }),
    taskSpec: taskSpec(),
    pythonPath: "python"
  });
  assert.equal(evidence.status, "unavailable");
  assert.equal(evidence.hasReliableCheck, false);
});

test("only the nearest following code cell can supply visible asserts", async () => {
  let executedTests = "";
  const extractor = new EvidenceExtractor({
    run: async (_code, tests) => {
      executedTests = tests;
      return { status: "passed", summary: "" };
    }
  });
  const evidence = await extractor.collectGenericEvidence({
    context: context({
      nearbyCode: ["assert unrelated()", "assert solve(2) == 4"],
      nearbyCodeCells: [
        { cellIndex: 1, code: "assert unrelated()", output: "" },
        { cellIndex: 3, code: "assert solve(2) == 4", output: "" }
      ]
    }),
    taskSpec: taskSpec(),
    pythonPath: "python"
  });
  assert.equal(evidence.status, "passed");
  assert.equal(executedTests, "assert solve(2) == 4");
});

test("unsafe inferred test blocks are rejected without execution", async () => {
  let calls = 0;
  const extractor = new EvidenceExtractor({ run: async () => { calls += 1; return { status: "passed", summary: "" }; } });
  const evidence = await extractor.collectGenericEvidence({
    context: context(),
    taskSpec: { ...taskSpec(), generatedTests: "assert open('result.txt').read() == 'x'" },
    pythonPath: "python"
  });
  assert.equal(evidence.status, "unavailable");
  assert.equal(calls, 0);
});

function context(overrides = {}) {
  return {
    notebookUri: "file:///test.ipynb",
    cellIndex: 2,
    currentCode: "def solve(value):\n    return value * 2\n",
    currentOutput: "",
    beforeMarkdown: [],
    afterMarkdown: [],
    nearbyCode: [],
    nearbyOutputs: [],
    nearbyCodeCells: [],
    ...overrides
  };
}

function taskSpec() {
  return {
    id: "generic:test",
    sourceMode: "generic_llm",
    taskSummary: "Double a number",
    expectedBehavior: "Return twice the input",
    title: "Double a number",
    promptMarkdown: "",
    targetConcepts: ["functions"],
    primaryConcept: "functions",
    difficulty: 1,
    confidence: 0.8
  };
}
