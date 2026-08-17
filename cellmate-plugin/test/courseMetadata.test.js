const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const resources = path.join(__dirname, "..", "resources");
const manifest = readJson("course_manifest.json");
const evaluation = readJson("evaluation_set.json");
const expert = readJson("expert_course_metadata.json");

test("expert metadata is pinned to the same course commit as the manifest", () => {
  assert.equal(expert.courseCommit, manifest.courseCommit);
  assert.equal(expert.version, 1);
});

test("all ten evaluation exercises have complete expert metadata", () => {
  assert.equal(evaluation.exercises.length, 10);
  for (const entry of evaluation.exercises) {
    const metadata = expert.exercises[entry.id];
    assert.ok(metadata, `missing expert metadata for ${entry.id}`);
    assert.equal(typeof metadata.primary_concept, "string");
    assert.equal(typeof metadata.difficulty, "number");
    assert.ok(Array.isArray(metadata.concepts));
    assert.ok(Array.isArray(metadata.next_exercises));
    assert.ok(Array.isArray(metadata.next_concepts));

    const generated = manifest.exercises.find((exercise) => exercise.id === entry.id);
    assert.ok(generated, `missing manifest exercise ${entry.id}`);
    assert.equal(generated.primary_concept, metadata.primary_concept);
    assert.deepEqual(generated.next_exercises, metadata.next_exercises);
  }
});

test("exercise 5.1 metadata matches the Quaternion class exercise", () => {
  const metadata = expert.exercises["exercise-5_1"];
  assert.equal(metadata.primary_concept, "classes");
  assert.ok(metadata.concepts.includes("operator_overloading"));
  assert.equal(metadata.concepts.includes("numpy"), false);
});

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(resources, name), "utf8"));
}
