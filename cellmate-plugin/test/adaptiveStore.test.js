const assert = require("node:assert/strict");
const { promises: fs } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  AdaptiveStore,
  AdaptiveStoreConflictError
} = require("../out/adaptive/store");

test("migrates legacy learner and attempt data on the next mutation", async () => withTempDirectory(async (directory) => {
  await fs.writeFile(path.join(directory, "adaptive-next-step.json"), JSON.stringify({
    version: 1,
    learners: { "local-demo-student": { studentId: "local-demo-student", mastery: { loops: 55 } } },
    attempts: [{
      fingerprint: "legacy-attempt",
      exerciseId: "exercise-1_1",
      action: "HINT",
      evidence: { status: "failed", summary: "AssertionError", source: "assert" },
      createdAt: "2026-01-01T00:00:00.000Z"
    }]
  }), "utf8");

  const store = createStore(directory);
  await store.adoptLegacyParticipant("participant-1");
  assert.equal((await store.getLearner("participant-1")).mastery.for_loops, 55);
  assert.equal((await store.attemptHistory("participant-1"))[0].participantId, "participant-1");
  assert.equal(JSON.parse(await storeFile(directory)).version, 3);
}));

test("migrates version 2 data and keeps generated tasks when resetting a participant", async () => withTempDirectory(async (directory) => {
  const generated = generatedExercise("existing-generated");
  await fs.writeFile(path.join(directory, "adaptive-next-step.json"), JSON.stringify({
    version: 2,
    learners: { "participant-1": learner(62) },
    attempts: [commitInput("old-attempt", learner(50), learner(62)).attempt],
    generated: { [generated.id]: generated }
  }), "utf8");
  const store = createStore(directory);
  assert.equal((await store.getLearner("participant-1")).mastery.for_loops, 62);
  await store.resetParticipant("participant-1");
  assert.deepEqual((await store.getLearner("participant-1")).mastery, {});
  assert.equal((await store.attemptHistory("participant-1")).length, 0);
  assert.equal((await store.getGenerated(generated.id)).id, generated.id);
  assert.equal(JSON.parse(await storeFile(directory)).version, 3);
}));

test("commitAttempt saves learner, attempt, and generated task in one idempotent mutation", async () => withTempDirectory(async (directory) => {
  const store = createStore(directory);
  const input = commitInput("fingerprint-1", learner(50), learner(58), generatedExercise("generated-1"));
  const first = await store.commitAttempt(input);
  const second = await store.commitAttempt({ ...input, learnerAfter: learner(99) });

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal((await store.getLearner("participant-1")).mastery.for_loops, 58);
  assert.equal((await store.attemptHistory("participant-1")).length, 1);
  assert.equal((await store.getGenerated("generated-1")).id, "generated-1");
  assert.equal(second.learner.mastery.for_loops, 58);
}));

test("serialises concurrent mutations without losing generated records", async () => withTempDirectory(async (directory) => {
  const store = createStore(directory);
  await Promise.all([
    store.saveGenerated(generatedExercise("generated-a")),
    store.saveGenerated(generatedExercise("generated-b"))
  ]);
  assert.equal((await store.getGenerated("generated-a")).id, "generated-a");
  assert.equal((await store.getGenerated("generated-b")).id, "generated-b");

  const input = commitInput("same-fingerprint", learner(50), learner(58));
  const results = await Promise.all([store.commitAttempt(input), store.commitAttempt(input)]);
  assert.deepEqual(results.map((result) => result.created).sort(), [false, true]);
  assert.equal((await store.attemptHistory("participant-1")).length, 1);
}));

test("rejects a stale concurrent learner update instead of overwriting progress", async () => withTempDirectory(async (directory) => {
  const store = createStore(directory);
  await store.commitAttempt(commitInput("first", learner(50), learner(58)));
  await assert.rejects(
    store.commitAttempt(commitInput("stale-second", learner(50), learner(44))),
    (error) => error instanceof AdaptiveStoreConflictError
  );
  assert.equal((await store.getLearner("participant-1")).mastery.for_loops, 58);
  assert.deepEqual((await store.attemptHistory("participant-1")).map((attempt) => attempt.fingerprint), ["first"]);
}));

test("a failed atomic rename preserves the last valid store", async () => withTempDirectory(async (directory) => {
  const store = createStore(directory);
  await store.commitAttempt(commitInput("first", learner(50), learner(58)));
  const before = await storeFile(directory);
  const failingFileSystem = {
    readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
    mkdir: (directoryPath, options) => fs.mkdir(directoryPath, options),
    writeFile: (filePath, content, encoding) => fs.writeFile(filePath, content, encoding),
    rename: async () => { throw new Error("injected rename failure"); },
    unlink: (filePath) => fs.unlink(filePath)
  };
  const failingStore = createStore(directory, failingFileSystem);
  await assert.rejects(failingStore.saveGenerated(generatedExercise("not-committed")), /injected rename failure/);
  assert.equal(await storeFile(directory), before);
  assert.equal((await fs.readdir(directory)).some((name) => name.endsWith(".tmp")), false);
}));

test("malformed or unknown store versions fail without being overwritten", async () => withTempDirectory(async (directory) => {
  const filePath = path.join(directory, "adaptive-next-step.json");
  for (const content of ["{broken", JSON.stringify({ version: 99, learners: {}, attempts: [], generated: {} })]) {
    await fs.writeFile(filePath, content, "utf8");
    const store = createStore(directory);
    await assert.rejects(store.getLearner("participant-1"));
    await assert.rejects(store.saveGenerated(generatedExercise("not-written")));
    assert.equal(await fs.readFile(filePath, "utf8"), content);
  }
}));

function createStore(directory, fileSystem) {
  return new AdaptiveStore({ globalStorageUri: { fsPath: directory } }, fileSystem);
}

function learner(score) {
  return { studentId: "participant-1", mastery: { for_loops: score } };
}

function commitInput(fingerprint, learnerBefore, learnerAfter, generated) {
  return {
    learnerBefore,
    learnerAfter,
    generated,
    attempt: {
      participantId: "participant-1",
      fingerprint,
      exerciseId: "exercise-1_1",
      action: "SIMILAR",
      evidence: { status: "passed", summary: "assert passed", source: "assert", confidence: "high", hasReliableCheck: true },
      taskSpec: {
        id: "exercise-1_1",
        sourceMode: "course_verified",
        taskSummary: "Use a loop",
        expectedBehavior: "Return a result",
        title: "Loop",
        promptMarkdown: "",
        targetConcepts: ["for_loops"],
        primaryConcept: "for_loops",
        difficulty: 1,
        confidence: 1
      },
      generatedId: generated?.id,
      createdAt: "2026-01-01T00:00:00.000Z"
    }
  };
}

function generatedExercise(id) {
  return {
    id,
    origin: "generated",
    parentId: "exercise-1_1",
    action: "SIMILAR",
    title: "Generated practice",
    promptMarkdown: "Practise a loop.",
    targetConcepts: ["for_loops"],
    starterCode: "def solve():\n    pass\n",
    referenceSolution: "def solve():\n    return 1\n",
    testCode: "assert solve() == 1\n",
    model: "test",
    promptVersion: "test",
    createdAt: "2026-01-01T00:00:00.000Z",
    validated: true
  };
}

async function storeFile(directory) {
  return fs.readFile(path.join(directory, "adaptive-next-step.json"), "utf8");
}

async function withTempDirectory(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cellmate-store-"));
  try {
    await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
