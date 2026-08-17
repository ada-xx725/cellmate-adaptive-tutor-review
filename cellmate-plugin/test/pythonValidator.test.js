const assert = require("node:assert/strict");
const test = require("node:test");
const { PythonValidator } = require("../out/adaptive/pythonValidator");

test("accepts a generated exercise only when its reference solution passes and starter fails", async () => {
  const validator = new PythonValidator();
  const candidate = {
    title: "Add two numbers",
    promptMarkdown: "Implement add.",
    targetConcepts: ["functions"],
    starterCode: "def add(a, b):\n    raise NotImplementedError\n",
    referenceSolution: "def add(a, b):\n    return a + b\n",
    testCode: "assert add(2, 3) == 5\n",
    model: "test"
  };
  assert.equal(await validator.validate(candidate, "python"), true);
});

test("rejects generated exercises without visible assertions", async () => {
  const validator = new PythonValidator();
  const result = await validator.validateDetailed({
    title: "Add two numbers",
    promptMarkdown: "Implement add.",
    targetConcepts: ["functions"],
    starterCode: "def add(a, b):\n    raise NotImplementedError\n",
    referenceSolution: "def add(a, b):\n    return a + b\n",
    testCode: "result = add(2, 3)\n",
    model: "test"
  }, "python");
  assert.equal(result.ok, false);
  assert.match(result.summary, /hasAssertions=false/);
});

test("stops Python execution after the configured timeout", async () => {
  const validator = new PythonValidator();
  const result = await validator.run("while True:\n    pass\n", "", "python", 100);
  assert.equal(result.status, "unavailable");
  assert.equal(result.hasReliableCheck, false);
  assert.match(result.summary, /timed out after 100 ms/);
});
