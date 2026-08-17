const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { validateFormalStatePack } = require("./validateFormalStatePack");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const STATE_PATH = path.join(PLUGIN_ROOT, "evaluation", "states", "action-quality-v1.jsonl");
const MANIFEST_PATH = path.join(PLUGIN_ROOT, "evaluation", "states", "ACTION_QUALITY_STATE_PACK_V1.json");
const STATE_PACK_VERSION = "action-quality-states-v1";
const SCALE_NOTE = "50 is the initial/default level; higher values indicate stronger recent evidence.";

const expertMetadata = readJson(path.join(PLUGIN_ROOT, "resources", "expert_course_metadata.json"));
const evaluationSet = readJson(path.join(PLUGIN_ROOT, "resources", "evaluation_set.json"));
const courseManifest = readJson(path.join(PLUGIN_ROOT, "resources", "course_manifest.json"));

const CASES = Object.freeze({
  quadratic_failure: courseCase("exercise-1_6", {
    title: "Correct the quadratic-roots formula",
    taskSummary: "Correct the supplied expressions for both roots of a quadratic equation.",
    taskSummaryAlt: "Repair the code so it calculates the two quadratic roots from a, b, and c.",
    expectedBehavior: "Compute the discriminant b squared minus 4ac and divide each numerator by 2a.",
    expectedBehaviorAlt: "Return both roots using the standard quadratic formula with the full 2a denominator.",
    studentCode: "from math import sqrt\na = 2\nb = 1\nc = -2\nq = sqrt(b*b - 4*a*c)\nx1 = (-b + q) / 2 * a\nx2 = (-b - q) / 2 * a\n",
    evidence: failedEvidence("The discriminant was correct, but both roots used multiplication by a instead of division by 2a.", "Both root assertions failed because the denominator grouping was wrong.", "quadratic_denominator_grouping", 4, 6, ["real-valued outputs", "discriminant", "first root", "second root"])
  }),
  accumulator_failure: courseCase("exercise-1_15", {
    title: "Implement the sum function",
    taskSummary: "Implement my_sum to add every value in a list using a loop.",
    taskSummaryAlt: "Write my_sum so a loop accumulates all elements of the input list.",
    expectedBehavior: "Return one number equal to the sum of all elements, including for empty and negative-valued lists.",
    expectedBehaviorAlt: "Produce the same total as Python sum for empty, mixed-sign, and long input sequences.",
    studentCode: "def my_sum(x):\n    total = 0\n    for value in x:\n        total = value\n    return total\n",
    evidence: failedEvidence("The function returned only the final element for non-empty inputs.", "Non-empty checks showed that the running total was overwritten on each iteration.", "accumulator_overwritten", 3, 5, ["callable", "numeric result", "mixed signs", "empty input", "long range"])
  }),
  prime_failure: courseCase("exercise-2_7", {
    title: "List prime numbers up to n",
    taskSummary: "Implement prime_list to list every prime number up to n.",
    taskSummaryAlt: "Write prime_list so its result contains exactly the primes not exceeding n.",
    expectedBehavior: "Return an empty list below 2 and an ordered list beginning with 2 for larger limits.",
    expectedBehaviorAlt: "Include each prime at most once, exclude 1 and composites, and preserve ascending order.",
    studentCode: "def prime_list(n):\n    return [value for value in range(1, n + 1) if all(value % divisor for divisor in range(2, value))]\n",
    evidence: failedEvidence("The result incorrectly included 1 as a prime.", "Boundary and expected-list checks failed because 1 was included.", "one_classified_as_prime", 5, 7, ["result type", "empty range", "small primes", "upper bound", "element types"])
  }),
  simple_class_failure: courseCase("exercise-4_6", {
    title: "Implement the Simple class",
    taskSummary: "Implement Simple so double mutates attribute i to twice its current value.",
    taskSummaryAlt: "Complete Simple.__init__ and double, with double updating stored state in place.",
    expectedBehavior: "Construct Simple(i); each double call replaces i with 2*i and returns None.",
    expectedBehaviorAlt: "Repeated double calls must mutate the same object, work for supported values, and have no return value.",
    studentCode: "class Simple:\n    def __init__(self, i):\n        self.i = i\n\n    def double(self):\n        return 2 * self.i\n",
    evidence: failedEvidence("double returned a value without changing the stored attribute.", "Mutation and no-return checks failed although construction and callability passed.", "method_returns_without_mutating", 3, 5, ["construction", "stored attribute", "repeated mutation", "return value", "callable method"])
  }),
  factorial_pass: courseCase("exercise-2_4", {
    title: "Implement the factorial function",
    taskSummary: "Implement my_factorial for a non-negative integer using a loop.",
    taskSummaryAlt: "Write a loop-based my_factorial with the correct zero and one base cases.",
    expectedBehavior: "Return 1 for zero and one, and the product from 1 through n for positive n.",
    expectedBehaviorAlt: "Match factorial values for non-negative inputs while remaining callable and numeric.",
    studentCode: "def my_factorial(n):\n    result = 1\n    for value in range(1, n + 1):\n        result *= value\n    return result\n",
    evidence: passedEvidence("All six available factorial checks passed.", "The complete available factorial check set passed, including both base cases.", 6, 6, ["zero", "one", "small positive", "numeric result", "callable"])
  }),
  file_pass: courseCase("exercise-3_7", {
    title: "Read a two-column data file",
    taskSummary: "Read the two data columns into lists and arrays and compute the y extrema.",
    taskSummaryAlt: "Parse data/xy.dat into x/y lists and arrays, then store the minimum and maximum y values.",
    expectedBehavior: "Create xlist, ylist, xarray, yarray, ymin, and ymax with all 301 rows represented.",
    expectedBehaviorAlt: "Preserve both numeric columns, convert them to matching arrays, and report the correct y range.",
    studentCode: "import numpy as np\nxlist = []\nylist = []\nwith open('data/xy.dat') as source:\n    for line in source:\n        x, y = map(float, line.split())\n        xlist.append(x)\n        ylist.append(y)\nxarray = np.array(xlist)\nyarray = np.array(ylist)\nymin = min(ylist)\nymax = max(ylist)\n",
    evidence: passedEvidence("All available shape, endpoint, type, and extrema checks passed.", "The full file-parsing check set passed for 301 rows, arrays, endpoints, and y extrema.", 15, 15, ["first row", "last row", "row count", "array shape", "types", "minimum", "maximum"])
  }),
  quaternion_pass: courseCase("exercise-5_1", {
    title: "Complete Quaternion arithmetic",
    taskSummary: "Complete Quaternion addition, subtraction, scalar and quaternion multiplication, conjugate, magnitude, inverse, equality, and repr.",
    taskSummaryAlt: "Implement the required Quaternion special methods and arithmetic operations from the lecture specification.",
    expectedBehavior: "All operations must return correctly composed Quaternion values, preserve non-commutative multiplication, and format reproducibly.",
    expectedBehaviorAlt: "Support the tested constructors and arithmetic in both operand orders with correct components and representations.",
    studentCode: "class Quaternion:\n    def __init__(self, a=0, b=0, c=0, d=0):\n        self._1, self._i, self._j, self._k = a, b, c, d\n    def __add__(self, other):\n        return Quaternion(self._1+other._1, self._i+other._i, self._j+other._j, self._k+other._k)\n    def conjugate(self):\n        return Quaternion(self._1, -self._i, -self._j, -self._k)\n",
    evidence: passedEvidence("The frozen Quaternion operation and representation checks all passed.", "All checked constructors, representations, additions, products, conjugates, and magnitudes passed.", 12, 12, ["construction", "repr", "addition", "subtraction", "scalar multiplication", "quaternion multiplication", "conjugate", "magnitude"])
  }),
  factorial_unavailable: courseCase("exercise-3_5", {
    title: "Factorial with exception handling",
    taskSummary: "Implement my_factorial and raise ValueError for a negative input.",
    taskSummaryAlt: "Write my_factorial for non-negative integers and reject negative values with ValueError.",
    expectedBehavior: "Return factorial for non-negative integers and raise ValueError when n is negative.",
    expectedBehaviorAlt: "Handle zero and positive factorials while explicitly signalling negative input as invalid.",
    studentCode: "def my_factorial(n):\n    if n < 0:\n        raise ValueError('invalid input')\n    result = 1\n    for value in range(1, n + 1):\n        result *= value\n    return result\n",
    evidence: unavailableEvidence("The check cell showed an unrecognised cache warning and no explicit result.", "No trustworthy pass or failure marker was produced by the check cell.")
  }),
  digits_unavailable: courseCase("exercise-1_11", {
    title: "Count decimal digits",
    taskSummary: "Implement num_digits with a while loop for a non-negative integer.",
    taskSummaryAlt: "Write num_digits to count how many decimal digits are needed to represent a non-negative integer.",
    expectedBehavior: "Return 1 for values from 0 to 9 and the correct digit count for larger integers.",
    expectedBehaviorAlt: "Use repeated integer reduction and treat zero as a one-digit value.",
    studentCode: "def num_digits(a):\n    count = 1\n    while a >= 10:\n        a //= 10\n        count += 1\n    return count\n",
    evidence: notRunEvidence("The course assertion cell has not been executed.", "No explicit course check result is available because the check was not run.")
  }),
  reverse_narrow: courseCase("exercise-4_2", {
    title: "Reverse a dictionary",
    taskSummary: "Implement reverse_dict with a dictionary comprehension.",
    taskSummaryAlt: "Write reverse_dict to swap each unique input value with its original key.",
    expectedBehavior: "Return a new dictionary mapping every original value to its original key.",
    expectedBehaviorAlt: "For mappings with unique values, reverse all key-value pairs without mutating the input.",
    studentCode: "def reverse_dict(dictionary):\n    return {value: key for key, value in dictionary.items()}\n",
    evidence: narrowEvidence("One visible course example assertion passed.", "The single executed example check succeeded, but the rest of the course checks were not run.", 1, 1, ["one dictionary example"], ["value lookup", "result type", "result length", "empty mapping"])
  }),
  file_narrow: courseCase("exercise-3_7", {
    title: "Read a two-column data file",
    taskSummary: "Parse the x and y columns and compute their array forms and extrema.",
    taskSummaryAlt: "Read both numeric columns from data/xy.dat into the required list and array variables.",
    expectedBehavior: "Represent every row in matching lists and arrays and calculate the correct y minimum and maximum.",
    expectedBehaviorAlt: "Preserve the full 301-row dataset and expose the required endpoints, shapes, types, and extrema.",
    studentCode: "import numpy as np\nxlist = []\nylist = []\nwith open('data/xy.dat') as source:\n    for line in source:\n        x, y = map(float, line.split())\n        xlist.append(x)\n        ylist.append(y)\nxarray = np.array(xlist)\nyarray = np.array(ylist)\nymin = min(ylist)\nymax = max(ylist)\n",
    evidence: narrowEvidence("Only the first-row and last-row visible checks passed.", "Two endpoint assertions succeeded; shapes, types, row count, and extrema remain untested.", 2, 2, ["first x", "last y"], ["row count", "array shape", "types", "minimum", "maximum"])
  }),
  count_positive_failure: standaloneCase("generated_attempt", "generated:count-positive-v1", {
    title: "Count positive values",
    taskSummary: "Count the values in a list that are strictly greater than zero.",
    taskSummaryAlt: "Return how many list elements are positive, excluding zero and all negatives.",
    expectedBehavior: "Return the number of positive elements; zero and negative values do not count.",
    expectedBehaviorAlt: "Use an explicit positive comparison and return zero for an empty or non-positive list.",
    primaryConcept: "conditionals",
    targetConcepts: ["functions", "for_loops", "conditionals", "accumulators", "lists"],
    difficulty: 2,
    studentCode: "def count_positive(values):\n    count = 0\n    for value in values:\n        if value:\n            count += 1\n    return count\n",
    evidence: failedEvidence("Negative non-zero values were counted as positive.", "Mixed-sign checks failed because truthiness was used instead of a greater-than-zero comparison.", "truthiness_instead_of_positive_comparison", 4, 7, ["positive values", "negative values", "mixed signs", "zero", "empty list"])
  }),
  normalize_words_pass: standaloneCase("generated_attempt", "generated:normalize-words-v1", {
    title: "Normalize words",
    taskSummary: "Trim and lowercase each non-empty word in a list.",
    expectedBehavior: "Return normalized words in order while dropping entries that become empty after trimming.",
    primaryConcept: "strings",
    targetConcepts: ["functions", "strings", "lists", "comprehensions"],
    difficulty: 2,
    studentCode: "def normalize_words(words):\n    return [word.strip().lower() for word in words if word.strip()]\n",
    evidence: passedEvidence("All generated and locally validated checks passed.", "Whitespace, case, empty entries, order, and empty-list checks all passed.", 7, 7, ["whitespace", "case", "empty entries", "order", "empty list"])
  }),
  group_sign_unavailable: standaloneCase("generated_attempt", "generated:group-sign-v1", {
    title: "Group values by sign",
    taskSummary: "Return separate lists for negative, zero, and positive input values.",
    expectedBehavior: "Preserve the original order within each of the three sign groups.",
    primaryConcept: "conditionals",
    targetConcepts: ["functions", "conditionals", "lists", "dictionaries"],
    difficulty: 3,
    studentCode: "def group_by_sign(values):\n    result = {'negative': [], 'zero': [], 'positive': []}\n    for value in values:\n        key = 'negative' if value < 0 else 'positive' if value > 0 else 'zero'\n        result[key].append(value)\n    return result\n",
    evidence: notRunEvidence("The stored generated verifier has not been executed.", "No verifier result exists for the current generated attempt.")
  }),
  clamp_narrow: standaloneCase("generated_attempt", "generated:clamp-values-v1", {
    title: "Clamp values to a range",
    taskSummary: "Clamp every input value between a lower and upper bound.",
    expectedBehavior: "Values below low become low, values above high become high, and in-range values are unchanged.",
    primaryConcept: "conditionals",
    targetConcepts: ["functions", "conditionals", "lists", "bounds"],
    difficulty: 2,
    studentCode: "def clamp_values(values, low, high):\n    return [max(low, min(value, high)) for value in values]\n",
    evidence: narrowEvidence("One ordinary in-range example passed.", "Only a normal in-range list was checked; bound crossings and invalid bounds were not covered.", 1, 1, ["ordinary in-range values"], ["below lower bound", "above upper bound", "empty list", "equal bounds"])
  }),
  parse_scores_failure: standaloneCase("generic_llm", "generic:parse-scores-v1", {
    title: "Parse comma-separated scores",
    taskSummary: "Convert comma-separated integer fields into a list of integers.",
    expectedBehavior: "Ignore surrounding whitespace and empty fields while preserving the remaining integer order.",
    primaryConcept: "parsing",
    targetConcepts: ["functions", "strings", "lists", "parsing", "type_conversion"],
    difficulty: 2,
    studentCode: "def parse_scores(text):\n    return [int(part) for part in text.split(',')]\n",
    evidence: failedEvidence("Whitespace-only and empty fields raised ValueError.", "The parser handled plain integers but failed on empty comma fields.", "empty_field_not_filtered", 3, 6, ["single value", "multiple values", "whitespace", "negative values", "empty fields", "empty string"])
  }),
  parse_scores_pass: standaloneCase("generic_llm", "generic:parse-scores-v1", {
    title: "Parse comma-separated scores",
    taskSummary: "Convert comma-separated integer fields into a list of integers.",
    taskSummaryAlt: "Parse a comma-delimited score string, skipping blank fields and trimming whitespace.",
    expectedBehavior: "Ignore surrounding whitespace and empty fields while preserving the remaining integer order.",
    expectedBehaviorAlt: "Return integers in source order for single, multiple, spaced, signed, and partially empty input.",
    primaryConcept: "parsing",
    targetConcepts: ["functions", "strings", "lists", "parsing", "type_conversion"],
    difficulty: 2,
    studentCode: "def parse_scores(text):\n    return [int(part.strip()) for part in text.split(',') if part.strip()]\n",
    evidence: passedEvidence("All controlled parsing checks passed.", "The complete validated check set passed for spacing, signs, blank fields, and empty input.", 7, 7, ["single value", "multiple values", "whitespace", "negative values", "empty fields", "empty string"])
  }),
  unique_order_pass: standaloneCase("generic_llm", "generic:unique-in-order-v1", {
    title: "Keep unique values in order",
    taskSummary: "Return the first occurrence of each list value in original order.",
    expectedBehavior: "Remove later duplicates without sorting or changing the surviving value order.",
    primaryConcept: "lists",
    targetConcepts: ["functions", "lists", "sets", "for_loops"],
    difficulty: 2,
    studentCode: "def unique_in_order(values):\n    seen = set()\n    result = []\n    for value in values:\n        if value not in seen:\n            seen.add(value)\n            result.append(value)\n    return result\n",
    evidence: passedEvidence("All controlled uniqueness and ordering checks passed.", "Duplicates, empty input, already unique input, and order preservation all passed.", 6, 6, ["duplicates", "empty list", "unique list", "order", "mixed values"])
  }),
  chunk_narrow: standaloneCase("generic_llm", "generic:chunk-list-v1", {
    title: "Split a list into chunks",
    taskSummary: "Split a list into consecutive chunks of a requested positive size.",
    expectedBehavior: "Return all values exactly once and allow a shorter final chunk.",
    primaryConcept: "lists",
    targetConcepts: ["functions", "lists", "slicing", "ranges"],
    difficulty: 2,
    studentCode: "def chunk_list(values, size):\n    return [values[index:index + size] for index in range(0, len(values), size)]\n",
    evidence: narrowEvidence("One evenly divisible example passed.", "Only a list whose length was divisible by the chunk size was checked.", 1, 1, ["even division"], ["short final chunk", "empty list", "size one", "invalid size"])
  })
});

const PAIR_SPECS = Object.freeze([
  pair("quadratic_failure", "failure", "inv-course-failure-01", 0, "hint"),
  pair("quadratic_failure", "failure", "inv-course-failure-01", 1, "hint"),
  pair("accumulator_failure", "failure", "inv-course-failure-02", 0, "scaffold"),
  pair("accumulator_failure", "failure", "inv-course-failure-02", 1, "scaffold"),
  pair("prime_failure", "failure", "inv-course-failure-03", 0, "hint"),
  pair("prime_failure", "failure", "inv-course-failure-03", 1, "hint"),
  pair("simple_class_failure", "failure", "inv-course-failure-04", 0, "scaffold"),
  pair("simple_class_failure", "failure", "inv-course-failure-04", 1, "scaffold"),
  pair("count_positive_failure", "failure", "inv-generated-failure-01", 0, "hint"),
  pair("count_positive_failure", "failure", "inv-generated-failure-01", 1, "hint"),
  pair("parse_scores_failure", "repeated_pair", undefined, 0, "hint"),

  pair("factorial_pass", "pass", "inv-course-pass-01", 0),
  pair("factorial_pass", "pass", "inv-course-pass-01", 1),
  pair("file_pass", "pass", "inv-course-pass-02", 0),
  pair("file_pass", "pass", "inv-course-pass-02", 1),
  pair("quaternion_pass", "pass", "inv-course-pass-03", 0),
  pair("quaternion_pass", "pass", "inv-course-pass-03", 1),
  pair("normalize_words_pass", "pass", undefined, 0),
  pair("parse_scores_pass", "pass", "inv-generic-pass-01", 0),
  pair("parse_scores_pass", "pass", "inv-generic-pass-01", 1),
  pair("unique_order_pass", "pass", undefined, 0),

  pair("factorial_unavailable", "needs", "inv-course-needs-01", 0),
  pair("factorial_unavailable", "needs", "inv-course-needs-01", 1),
  pair("digits_unavailable", "needs", undefined, 0),
  pair("group_sign_unavailable", "needs", undefined, 0),

  pair("reverse_narrow", "narrow", "inv-course-narrow-01", 0),
  pair("reverse_narrow", "narrow", "inv-course-narrow-01", 1),
  pair("file_narrow", "narrow", undefined, 0),
  pair("clamp_narrow", "narrow", undefined, 0),
  pair("chunk_narrow", "narrow", undefined, 0)
]);

function buildActionQualityStatePack() {
  const states = [];
  const pairRecords = [];
  for (const [pairIndex, spec] of PAIR_SPECS.entries()) {
    const stateIds = [];
    for (const memberIndex of [0, 1]) {
      const stateId = `heldout-${String(states.length + 1).padStart(3, "0")}`;
      stateIds.push(stateId);
      states.push(buildState(spec, pairIndex, memberIndex, stateId));
    }
    pairRecords.push({
      pairId: `cf-${String(pairIndex + 1).padStart(3, "0")}`,
      invarianceKey: spec.invarianceKey,
      stateIds
    });
  }

  const validation = validateFormalStatePack(states, { final: true });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const invarianceGroups = buildInvarianceGroups(pairRecords);
  if (invarianceGroups.length < 12) throw new Error(`Expected at least 12 invariance groups, found ${invarianceGroups.length}.`);

  const jsonl = `${states.map((state) => JSON.stringify(state)).join("\n")}\n`;
  const courseStates = states.filter((state) => state.source_mode === "course_verified");
  const manifest = {
    statePackVersion: STATE_PACK_VERSION,
    protocolVersion: "action-quality-protocol-v1",
    annotationGuideVersion: "annotation-guide-v1",
    schemaVersion: 1,
    file: "action-quality-v1.jsonl",
    stateCount: states.length,
    sha256: canonicalHash(jsonl),
    hashCanonicalization: "UTF-8 text with CRLF normalized to LF",
    strata: validation.strata,
    sources: validation.sources,
    counterfactualPairCount: validation.counterfactualPairCount,
    invarianceGroupCount: invarianceGroups.length,
    invarianceGroups,
    courseCommit: expertMetadata.courseCommit,
    courseExercises: Array.from(new Set(courseStates.map((state) => state.task.id))).sort(),
    courseLectures: Array.from(new Set(courseStates.map((state) => state.course_context.lecture))).sort(),
    evaluationSetExercises: evaluationSet.exercises.map((entry) => entry.id).sort(),
    generator: "evaluation/annotation/buildActionQualityStatePack.js",
    generatorSha256: canonicalFileHash(__filename),
    constructedData: true,
    policyOutputsObserved: false,
    referenceLabelsPresent: false,
    formalResultsPresent: false,
    createdAt: "2026-08-10"
  };
  if (JSON.stringify(manifest.courseExercises) !== JSON.stringify(manifest.evaluationSetExercises)) {
    throw new Error("Course states do not cover the frozen ten-exercise evaluation set.");
  }
  return { states, jsonl, manifest };
}

function writeCommittedPack() {
  const built = buildActionQualityStatePack();
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, built.jsonl, "utf8");
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(built.manifest, null, 2)}\n`, "utf8");
  return built;
}

function verifyCommittedPack() {
  const built = buildActionQualityStatePack();
  const committedJsonl = fs.readFileSync(STATE_PATH, "utf8").replace(/\r\n/g, "\n");
  if (committedJsonl !== built.jsonl) throw new Error("Committed action-quality state JSONL is not reproducible.");
  const committedManifest = readJson(MANIFEST_PATH);
  if (JSON.stringify(committedManifest) !== JSON.stringify(built.manifest)) {
    throw new Error("Committed action-quality state manifest is not reproducible.");
  }
  return built;
}

function buildState(spec, pairIndex, memberIndex, stateId) {
  const base = CASES[spec.caseKey];
  const profile = profileFor(spec.mode, memberIndex, base.task.target_concepts, spec.priorSupport);
  const task = wording(base.task, spec.wordingVariant);
  const evidence = wording(base.evidence, spec.wordingVariant);
  return {
    schema_version: 1,
    annotation_guide_version: "annotation-guide-v1",
    state_pack_version: STATE_PACK_VERSION,
    state_id: stateId,
    stratum: profile.stratum,
    source_mode: base.sourceMode,
    counterfactual_pair_id: `cf-${String(pairIndex + 1).padStart(3, "0")}`,
    task,
    student_code: base.studentCode,
    evidence,
    learner_before: profile.learner,
    history: profile.history,
    ...(base.courseContext ? { course_context: base.courseContext } : {})
  };
}

function profileFor(mode, memberIndex, concepts, priorSupport) {
  if (mode === "failure") {
    return memberIndex === 0
      ? { stratum: "first_failure", learner: learner(concepts, 52), history: [] }
      : {
          stratum: "repeated_failure",
          learner: learner(concepts, priorSupport === "scaffold" ? 38 : 42),
          history: [failedHistory(1, priorSupport ?? "hint")]
        };
  }
  if (mode === "repeated_pair") {
    return memberIndex === 0
      ? { stratum: "repeated_failure", learner: learner(concepts, 42), history: [failedHistory(1, "hint")] }
      : { stratum: "repeated_failure", learner: learner(concepts, 36), history: [failedHistory(1, "scaffold")] };
  }
  if (mode === "pass") {
    return memberIndex === 0
      ? { stratum: "developing_pass", learner: learner(concepts, 62), history: [] }
      : { stratum: "established_pass", learner: learner(concepts, 88), history: [passedHistory(1), passedHistory(2)] };
  }
  if (mode === "needs") {
    return memberIndex === 0
      ? { stratum: "needs_evidence", learner: learner(concepts, 54), history: [] }
      : { stratum: "needs_evidence", learner: learner(concepts, 86), history: [passedHistory(1)] };
  }
  if (mode === "narrow") {
    return memberIndex === 0
      ? { stratum: "narrow_pass", learner: learner(concepts, 60), history: [] }
      : { stratum: "narrow_pass", learner: learner(concepts, 84), history: [passedHistory(1)] };
  }
  throw new Error(`Unknown pair mode: ${mode}`);
}

function learner(concepts, baseScore) {
  const values = {};
  concepts.forEach((concept, index) => {
    const score = Math.max(0, Math.min(100, baseScore + (index % 3) * 2 - 2));
    values[concept] = { score, band: score >= 80 ? "established" : score < 45 ? "emerging" : "developing" };
  });
  return { scale_note: SCALE_NOTE, concepts: values };
}

function failedHistory(attemptIndex, supportType) {
  return {
    attempt_index: attemptIndex,
    evidence_status: "failed",
    error_signature: "same_error_repeated",
    support_received: {
      type: supportType,
      summary: supportType === "scaffold"
        ? "An ordered scaffold separated the required substeps and left an incomplete implementation slot."
        : "A targeted conceptual hint identified the relevant comparison or update without solution code."
    },
    support_outcome: `same_error_repeated_after_${supportType}`
  };
}

function passedHistory(attemptIndex) {
  return {
    attempt_index: attemptIndex,
    evidence_status: "passed",
    support_received: {
      type: "similar",
      summary: "A comparable consolidation task was offered without hints or a scaffold."
    },
    support_outcome: "independent_pass_on_similar_practice"
  };
}

function buildInvarianceGroups(pairRecords) {
  const buckets = {};
  for (const record of pairRecords.filter((entry) => entry.invarianceKey)) {
    (buckets[record.invarianceKey] ??= []).push(record);
  }
  const groups = [];
  for (const [key, records] of Object.entries(buckets)) {
    if (records.length !== 2) throw new Error(`Invariance key ${key} must identify exactly two counterfactual pairs.`);
    for (const memberIndex of [0, 1]) {
      groups.push({
        groupId: `${key}-member-${memberIndex + 1}`,
        stateIds: [records[0].stateIds[memberIndex], records[1].stateIds[memberIndex]],
        relation: "meaning_preserving_rewording"
      });
    }
  }
  return groups;
}

function wording(value, variant) {
  const copy = JSON.parse(JSON.stringify(value));
  if (variant === 1) {
    for (const [baseKey, altKey] of [
      ["title", "title_alt"],
      ["task_summary", "task_summary_alt"],
      ["expected_behavior", "expected_behavior_alt"],
      ["summary", "summary_alt"]
    ]) {
      if (copy[altKey]) copy[baseKey] = copy[altKey];
      delete copy[altKey];
    }
    if (copy.test_coverage?.summary_alt) copy.test_coverage.summary = copy.test_coverage.summary_alt;
  }
  delete copy.title_alt;
  delete copy.task_summary_alt;
  delete copy.expected_behavior_alt;
  delete copy.summary_alt;
  if (copy.test_coverage) delete copy.test_coverage.summary_alt;
  return copy;
}

function courseCase(exerciseId, input) {
  const metadata = expertMetadata.exercises[exerciseId];
  const manifestEntry = courseManifest.exercises.find((entry) => entry.id === exerciseId);
  if (!metadata || !manifestEntry) throw new Error(`Missing course metadata for ${exerciseId}.`);
  return {
    sourceMode: "course_verified",
    studentCode: input.studentCode,
    task: taskRecord(exerciseId, input, metadata.primary_concept, metadata.concepts, metadata.difficulty),
    evidence: input.evidence,
    courseContext: {
      lecture: manifestEntry.lecture,
      exercise_id: exerciseId,
      course_commit: expertMetadata.courseCommit,
      next_exercises: metadata.next_exercises,
      next_concepts: metadata.next_concepts
    }
  };
}

function standaloneCase(sourceMode, taskId, input) {
  return {
    sourceMode,
    studentCode: input.studentCode,
    task: taskRecord(taskId, input, input.primaryConcept, input.targetConcepts, input.difficulty),
    evidence: input.evidence
  };
}

function taskRecord(id, input, primaryConcept, targetConcepts, difficulty) {
  return {
    id,
    title: input.title,
    ...(input.titleAlt ? { title_alt: input.titleAlt } : {}),
    task_summary: input.taskSummary,
    ...(input.taskSummaryAlt ? { task_summary_alt: input.taskSummaryAlt } : {}),
    expected_behavior: input.expectedBehavior,
    ...(input.expectedBehaviorAlt ? { expected_behavior_alt: input.expectedBehaviorAlt } : {}),
    primary_concept: primaryConcept,
    target_concepts: targetConcepts,
    difficulty
  };
}

function failedEvidence(summary, summaryAlt, signature, passed, total, categories) {
  return evidenceRecord("failed", summary, summaryAlt, "explicit_asserts", "high", true, signature, passed, total, categories);
}

function passedEvidence(summary, summaryAlt, passed, total, categories) {
  return evidenceRecord("passed", summary, summaryAlt, "explicit_asserts", "high", true, null, passed, total, categories);
}

function unavailableEvidence(summary, summaryAlt) {
  return evidenceRecord("unavailable", summary, summaryAlt, "pybryt", "low", false, null, 0, 0, []);
}

function notRunEvidence(summary, summaryAlt) {
  return evidenceRecord("not_run", summary, summaryAlt, "explicit_asserts", "low", false, null, 0, 0, []);
}

function narrowEvidence(summary, summaryAlt, passed, total, categories, notCovered) {
  return evidenceRecord("passed", summary, summaryAlt, "visible_assert_subset", "high", true, null, passed, total, categories, notCovered);
}

function evidenceRecord(status, summary, summaryAlt, source, confidence, reliable, signature, passed, total, categories, notCovered) {
  return {
    status,
    summary,
    summary_alt: summaryAlt,
    source,
    confidence,
    has_reliable_check: reliable,
    error_signature: signature,
    test_coverage: {
      summary: `${passed}/${total} explicit checks are represented for this state.`,
      summary_alt: `Coverage records ${passed} passing checks from ${total} executed checks.`,
      passed_checks: passed,
      total_checks: total,
      categories,
      ...(notCovered ? { not_covered: notCovered } : {})
    }
  };
}

function pair(caseKey, mode, invarianceKey, wordingVariant, priorSupport) {
  return { caseKey, mode, invarianceKey, wordingVariant, priorSupport };
}

function canonicalHash(content) {
  return crypto.createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

function canonicalFileHash(filePath) {
  return canonicalHash(fs.readFileSync(filePath, "utf8"));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

if (require.main === module) {
  try {
    const result = process.argv.includes("--check") ? verifyCommittedPack() : writeCommittedPack();
    process.stdout.write(`state_pack=${STATE_PACK_VERSION} states=${result.states.length} sha256=${result.manifest.sha256}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  MANIFEST_PATH,
  STATE_PATH,
  buildActionQualityStatePack,
  verifyCommittedPack,
  writeCommittedPack
};
