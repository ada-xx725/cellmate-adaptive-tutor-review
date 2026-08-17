const fs = require("node:fs");
const path = require("node:path");

const STRATUM_TARGETS = Object.freeze({
  needs_evidence: 8,
  first_failure: 10,
  repeated_failure: 12,
  developing_pass: 10,
  established_pass: 10,
  narrow_pass: 10
});

const SOURCE_TARGETS = Object.freeze({
  course_verified: 40,
  generated_attempt: 10,
  generic_llm: 10
});

const FORBIDDEN_KEYS = new Set([
  "expectedStatus", "expected_status", "primaryAction", "primary_action",
  "primaryDecision", "primary_decision", "acceptableActions", "acceptable_actions",
  "forbiddenActions", "forbidden_actions", "policy", "policyName", "policy_name",
  "policyOutput", "policy_output", "learnerAfter", "learner_after", "referenceLabels",
  "reference_labels"
]);

function readJsonl(filePath) {
  return fs.readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, text: line.trim() }))
    .filter((entry) => entry.text)
    .map((entry) => {
      try {
        return JSON.parse(entry.text);
      } catch (error) {
        throw new Error(`Invalid JSON on line ${entry.line}: ${error.message}`);
      }
    });
}

function validateFormalStatePack(states, options = {}) {
  const finalMode = options.final === true;
  const errors = [];
  const ids = new Set();
  const strata = countBy(states, (state) => state?.stratum);
  const sources = countBy(states, (state) => state?.source_mode);

  states.forEach((state, index) => {
    const prefix = `state ${index + 1}${state?.state_id ? ` (${state.state_id})` : ""}`;
    const check = (condition, message) => {
      if (!condition) errors.push(`${prefix}: ${message}`);
    };

    check(isObject(state), "must be an object");
    if (!isObject(state)) return;
    check(state.schema_version === 1, "schema_version must be 1");
    check(state.annotation_guide_version === "annotation-guide-v1", "annotation_guide_version must be annotation-guide-v1");
    check(typeof state.state_pack_version === "string" && state.state_pack_version.length > 0, "state_pack_version is required");
    check(/^heldout(?:-v[0-9]+)?-[0-9]{3}$/.test(state.state_id ?? ""), "state_id must match heldout-XXX or heldout-vN-XXX");
    check(!ids.has(state.state_id), "state_id must be unique");
    ids.add(state.state_id);
    check(Object.hasOwn(STRATUM_TARGETS, state.stratum), "unknown stratum");
    check(Object.hasOwn(SOURCE_TARGETS, state.source_mode), "unknown source_mode");
    check(findForbiddenPaths(state).length === 0, `contains forbidden label fields: ${findForbiddenPaths(state).join(", ")}`);

    validateTask(state.task, prefix, errors);
    check(typeof state.student_code === "string", "student_code must be a string");
    validateEvidence(state.evidence, prefix, errors);
    validateLearner(state.learner_before, prefix, errors);
    validateHistory(state.history, prefix, errors);

    if (state.source_mode === "course_verified") {
      check(isObject(state.course_context), "course_verified states require course_context");
      check(Number.isInteger(state.course_context?.lecture) && state.course_context.lecture >= 1 && state.course_context.lecture <= 5,
        "course_context.lecture must be an integer from 1 to 5");
    }
  });

  const pairGroups = groupBy(states.filter((state) => state.counterfactual_pair_id), (state) => state.counterfactual_pair_id);
  for (const [pairId, members] of Object.entries(pairGroups)) {
    if (members.length !== 2) {
      errors.push(`counterfactual pair ${pairId}: expected exactly 2 members, found ${members.length}`);
      continue;
    }
    if (stableCounterfactualContent(members[0]) !== stableCounterfactualContent(members[1])) {
      errors.push(`counterfactual pair ${pairId}: members differ outside learner_before, history, stratum, and identity fields`);
    }
  }

  if (finalMode) {
    if (states.length !== 60) errors.push(`final pack: expected 60 states, found ${states.length}`);
    for (const [stratum, target] of Object.entries(STRATUM_TARGETS)) {
      if ((strata[stratum] ?? 0) !== target) errors.push(`final pack: stratum ${stratum} expected ${target}, found ${strata[stratum] ?? 0}`);
    }
    for (const [source, target] of Object.entries(SOURCE_TARGETS)) {
      if ((sources[source] ?? 0) !== target) errors.push(`final pack: source ${source} expected ${target}, found ${sources[source] ?? 0}`);
    }
    if (Object.keys(pairGroups).length < 12) errors.push(`final pack: expected at least 12 complete counterfactual pairs, found ${Object.keys(pairGroups).length}`);
    const lectures = new Set(states.filter((state) => state.source_mode === "course_verified").map((state) => state.course_context?.lecture));
    for (const lecture of [1, 2, 3, 4, 5]) {
      if (!lectures.has(lecture)) errors.push(`final pack: course lecture ${lecture} is not represented`);
    }
  }

  return {
    valid: errors.length === 0,
    mode: finalMode ? "final" : "draft",
    stateCount: states.length,
    strata,
    sources,
    counterfactualPairCount: Object.keys(pairGroups).length,
    errors
  };
}

function validateTask(task, prefix, errors) {
  if (!isObject(task)) {
    errors.push(`${prefix}: task must be an object`);
    return;
  }
  for (const key of ["id", "title", "task_summary", "expected_behavior", "primary_concept"]) {
    if (typeof task[key] !== "string" || !task[key]) errors.push(`${prefix}: task.${key} is required`);
  }
  if (!Array.isArray(task.target_concepts) || task.target_concepts.length === 0) errors.push(`${prefix}: task.target_concepts must be non-empty`);
  if (!Number.isInteger(task.difficulty) || task.difficulty < 1 || task.difficulty > 5) errors.push(`${prefix}: task.difficulty must be an integer from 1 to 5`);
}

function validateEvidence(evidence, prefix, errors) {
  if (!isObject(evidence)) {
    errors.push(`${prefix}: evidence must be an object`);
    return;
  }
  const statuses = new Set(["passed", "failed", "not_run", "unavailable"]);
  if (!statuses.has(evidence.status)) errors.push(`${prefix}: evidence.status is invalid`);
  if (typeof evidence.summary !== "string" || !evidence.summary) errors.push(`${prefix}: evidence.summary is required`);
  if (typeof evidence.source !== "string" || !evidence.source) errors.push(`${prefix}: evidence.source is required`);
  if (!["low", "medium", "high"].includes(evidence.confidence)) errors.push(`${prefix}: evidence.confidence is invalid`);
  if (typeof evidence.has_reliable_check !== "boolean") errors.push(`${prefix}: evidence.has_reliable_check must be boolean`);
  if (["passed", "failed"].includes(evidence.status) && evidence.has_reliable_check !== true) errors.push(`${prefix}: passed/failed evidence must have a reliable check`);
  if (["not_run", "unavailable"].includes(evidence.status) && evidence.has_reliable_check !== false) errors.push(`${prefix}: not_run/unavailable evidence cannot claim a reliable check`);
  const coverage = evidence.test_coverage;
  if (!isObject(coverage)) {
    errors.push(`${prefix}: evidence.test_coverage must be an object`);
    return;
  }
  if (typeof coverage.summary !== "string" || !coverage.summary) errors.push(`${prefix}: test_coverage.summary is required`);
  if (!Number.isInteger(coverage.passed_checks) || coverage.passed_checks < 0) errors.push(`${prefix}: passed_checks must be a non-negative integer`);
  if (!Number.isInteger(coverage.total_checks) || coverage.total_checks < 0) errors.push(`${prefix}: total_checks must be a non-negative integer`);
  if (coverage.passed_checks > coverage.total_checks) errors.push(`${prefix}: passed_checks cannot exceed total_checks`);
  if (!Array.isArray(coverage.categories)) errors.push(`${prefix}: test_coverage.categories must be an array`);
}

function validateLearner(learner, prefix, errors) {
  if (!isObject(learner) || typeof learner.scale_note !== "string" || !isObject(learner.concepts)) {
    errors.push(`${prefix}: learner_before must contain scale_note and concepts`);
    return;
  }
  if (Object.keys(learner.concepts).length === 0) errors.push(`${prefix}: learner_before.concepts must be non-empty`);
  for (const [concept, value] of Object.entries(learner.concepts)) {
    if (!isObject(value) || typeof value.score !== "number" || value.score < 0 || value.score > 100) errors.push(`${prefix}: invalid score for concept ${concept}`);
    if (!isObject(value) || !["emerging", "developing", "established"].includes(value.band)) errors.push(`${prefix}: invalid band for concept ${concept}`);
  }
}

function validateHistory(history, prefix, errors) {
  if (!Array.isArray(history)) {
    errors.push(`${prefix}: history must be an array`);
    return;
  }
  history.forEach((attempt, index) => {
    if (!isObject(attempt.support_received) || typeof attempt.support_received.type !== "string" || typeof attempt.support_received.summary !== "string") {
      errors.push(`${prefix}: history[${index}].support_received must contain type and summary`);
    }
    if (typeof attempt.support_outcome !== "string" || !attempt.support_outcome) errors.push(`${prefix}: history[${index}].support_outcome is required`);
  });
}

function findForbiddenPaths(value, currentPath = "") {
  if (!isObject(value) && !Array.isArray(value)) return [];
  const paths = [];
  for (const [key, nested] of Object.entries(value)) {
    const nestedPath = currentPath ? `${currentPath}.${key}` : key;
    if (FORBIDDEN_KEYS.has(key)) paths.push(nestedPath);
    paths.push(...findForbiddenPaths(nested, nestedPath));
  }
  return paths;
}

function stableCounterfactualContent(state) {
  const copy = JSON.parse(JSON.stringify(state));
  delete copy.state_id;
  delete copy.stratum;
  delete copy.counterfactual_pair_id;
  delete copy.learner_before;
  delete copy.history;
  return JSON.stringify(copy);
}

function countBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = selector(value);
    if (key !== undefined) result[key] = (result[key] ?? 0) + 1;
  }
  return result;
}

function groupBy(values, selector) {
  const result = {};
  for (const value of values) {
    const key = selector(value);
    (result[key] ??= []).push(value);
  }
  return result;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

if (require.main === module) {
  const input = process.argv[2];
  const finalMode = process.argv.includes("--final");
  if (!input || (process.argv.includes("--draft") && finalMode)) {
    process.stderr.write("Usage: npm run annotation:validate -- <state-pack.jsonl> [--draft|--final]\n");
    process.exitCode = 1;
  } else {
    try {
      const states = readJsonl(path.resolve(input));
      const result = validateFormalStatePack(states, { final: finalMode });
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      if (!result.valid) process.exitCode = 1;
    } catch (error) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  FORBIDDEN_KEYS,
  SOURCE_TARGETS,
  STRATUM_TARGETS,
  readJsonl,
  validateFormalStatePack
};
