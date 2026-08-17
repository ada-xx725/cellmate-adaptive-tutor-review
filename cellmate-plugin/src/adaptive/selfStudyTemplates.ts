import { createHash, randomUUID } from "crypto";
import { canonicalConceptId, canonicalConcepts } from "./concepts";
import { GeneratedCandidate, GeneratedExercise, NotebookContext, TaskSpec } from "./types";

export const SELF_STUDY_CONFIDENCE_THRESHOLD = 0.6;

export type TaskIntentAssessment =
  | { status: "grounded"; source: "explicit_marker" | "explicit_markdown"; statement: string }
  | { status: "needs_evidence"; reason: "missing_task_intent" };

export function shouldOfferSelfStudyFallback(taskSpec?: Pick<TaskSpec, "sourceMode" | "confidence">): boolean {
  return !taskSpec || (taskSpec.sourceMode === "generic_llm" && taskSpec.confidence < SELF_STUDY_CONFIDENCE_THRESHOLD);
}

export function assessNotebookTaskIntent(context: NotebookContext): TaskIntentAssessment {
  const marker = context.currentCode.match(/^\s*#\s*(?:CELLMATE_)?(?:TASK|GOAL|PROMPT)\s*:\s*(\S.+)$/im);
  if (marker?.[1]) {
    return { status: "grounded", source: "explicit_marker", statement: marker[1].trim() };
  }

  const markdownCells = [
    ...context.beforeMarkdown.slice(-3).reverse(),
    ...context.afterMarkdown.slice(0, 2)
  ].filter((text) => !/cellmate-(adaptive|selfstudy)/i.test(text));
  const statement = markdownCells.find(hasExplicitTaskCue)?.trim();
  if (statement) {
    return { status: "grounded", source: "explicit_markdown", statement };
  }
  return { status: "needs_evidence", reason: "missing_task_intent" };
}

export function notebookContextLooksUnresolved(context: NotebookContext): boolean {
  return assessNotebookTaskIntent(context).status === "needs_evidence";
}

export function selfStudyWasConfirmed(choice: string | undefined): boolean {
  return choice === "Start from goal";
}

export function fallbackTaskSpecFromGoal(goal: string): TaskSpec {
  const concepts = canonicalConcepts(conceptsFromGoal(goal));
  const primaryConcept = concepts.includes("accumulators") ? "accumulators" : concepts[0] ?? "python_basics";
  return {
    id: `selfstudy-goal:${hash(goal)}`,
    sourceMode: "self_study_goal",
    learningGoal: goal,
    taskSummary: summaryForConcept(primaryConcept),
    expectedBehavior: behaviorForConcept(primaryConcept),
    title: summaryForConcept(primaryConcept),
    promptMarkdown: `Goal: ${goal}`,
    targetConcepts: concepts,
    primaryConcept,
    difficulty: 1,
    confidence: 0.7,
    expectedFunction: functionForConcept(primaryConcept)
  };
}

export function selfStudyCandidateForTask(taskSpec: TaskSpec): GeneratedCandidate {
  const conceptText = `${taskSpec.primaryConcept} ${taskSpec.targetConcepts.join(" ")} ${taskSpec.learningGoal ?? ""}`.toLowerCase();
  if (/accumulator|running|sum|total/.test(conceptText)) return accumulatorTemplate();
  if (/loop|for|while/.test(conceptText)) return loopTemplate();
  if (/condition|if|else/.test(conceptText)) return conditionalTemplate();
  if (/function|def/.test(conceptText)) return functionTemplate();
  return arithmeticTemplate();
}

export function toSelfStudyGeneratedExercise(taskSpec: TaskSpec, candidate: GeneratedCandidate, uuid = randomUUID()): GeneratedExercise {
  const targetConcepts = canonicalConcepts(candidate.targetConcepts, taskSpec.targetConcepts);
  const primaryConcept = candidate.primaryConcept ? canonicalConceptId(candidate.primaryConcept) : chooseSelfStudyPrimaryConcept(targetConcepts, taskSpec.primaryConcept);
  const primary = safeId(primaryConcept);
  const id = `selfstudy:${primary}:${uuid}`;
  return {
    id,
    origin: "generated",
    originMode: "self_study_goal",
    parentId: "selfstudy",
    action: "SIMILAR",
    title: candidate.title,
    promptMarkdown: candidate.promptMarkdown,
    targetConcepts,
    primaryConcept,
    difficulty: candidate.difficulty ?? taskSpec.difficulty,
    starterCode: withSelfStudyHeader(id, { ...taskSpec, targetConcepts, primaryConcept }, candidate.starterCode),
    referenceSolution: candidate.referenceSolution,
    negativeCandidate: candidate.negativeCandidate,
    testCode: candidate.testCode,
    model: candidate.model,
    promptVersion: "self-study-goal-mvp-v1",
    createdAt: new Date().toISOString(),
    validated: false,
    fallbackUsed: candidate.model === "fallback-template",
    validationStatus: candidate.model === "fallback-template" ? "fallback" : undefined,
    learningGoal: taskSpec.learningGoal,
    taskSpec: { ...taskSpec, targetConcepts, primaryConcept, difficulty: candidate.difficulty ?? taskSpec.difficulty }
  };
}

function chooseSelfStudyPrimaryConcept(concepts: string[], fallback?: string): string {
  if (concepts.includes("accumulators")) return "accumulators";
  if (concepts.includes("conditionals")) return "conditionals";
  if (concepts.includes("for_loops")) return "for_loops";
  return fallback ? canonicalConceptId(fallback) : concepts[0] ?? "python_basics";
}

function withSelfStudyHeader(id: string, taskSpec: TaskSpec, code: string): string {
  const concepts = canonicalConcepts(taskSpec.targetConcepts).join(", ");
  const cleaned = code
    .replace(/^#\s*EXERCISE_ID:.*\r?\n?/m, "")
    .replace(/^#\s*ADAPTIVE_SOURCE_MODE:.*\r?\n?/m, "")
    .replace(/^#\s*TARGET_CONCEPTS:.*\r?\n?/m, "");
  return `# EXERCISE_ID: ${id}\n# ADAPTIVE_SOURCE_MODE: self_study_goal\n# TARGET_CONCEPTS: ${concepts}\n${cleaned}`;
}

function conceptsFromGoal(goal: string): string[] {
  const lower = goal.toLowerCase();
  const concepts = [
    ["for_loops", /for\b|loop|iterate/],
    ["accumulators", /accumulat|running|sum|total/],
    ["conditionals", /if\b|else|condition/],
    ["functions", /function|def\b/],
    ["arithmetic_operations", /arith|calculate|math|number|operator/],
    ["variables", /variable|assign/]
  ].filter(([, pattern]) => (pattern as RegExp).test(lower)).map(([concept]) => concept as string);
  return concepts.length ? Array.from(new Set(concepts)) : ["variables", "arithmetic_operations"];
}

function summaryForConcept(primaryConcept: string): string {
  if (primaryConcept === "accumulators") return "Practise loops and accumulators with a small total.";
  if (primaryConcept === "for_loops") return "Practise a simple for-loop transformation.";
  if (primaryConcept === "conditionals") return "Practise choosing values with a condition.";
  if (primaryConcept === "functions") return "Practise writing a small function.";
  return "Practise variables and arithmetic in a small function.";
}

function behaviorForConcept(primaryConcept: string): string {
  if (primaryConcept === "accumulators") return "Return the accumulated total from a list of numbers.";
  if (primaryConcept === "for_loops") return "Return a new list after applying the same operation to each item.";
  if (primaryConcept === "conditionals") return "Return only values that satisfy a simple condition.";
  if (primaryConcept === "functions") return "Return the requested value from a named Python function.";
  return "Return a calculated numeric result.";
}

function functionForConcept(primaryConcept: string): string {
  if (primaryConcept === "accumulators") return "sum_small_numbers";
  if (primaryConcept === "for_loops") return "double_values";
  if (primaryConcept === "conditionals") return "keep_positive";
  if (primaryConcept === "functions") return "greet_name";
  return "add_tax";
}

function accumulatorTemplate(): GeneratedCandidate {
  return {
    title: "Self-study mini task: running total",
    promptMarkdown: "Write `sum_small_numbers(values)` to return the sum of all numbers in `values`. Use a running total that starts at zero and update it inside a `for` loop.",
    targetConcepts: ["for_loops", "accumulators", "variables"],
    primaryConcept: "accumulators",
    difficulty: 1,
    starterCode: "def sum_small_numbers(values):\n    raise NotImplementedError\n",
    referenceSolution: "def sum_small_numbers(values):\n    total = 0\n    for value in values:\n        total += value\n    return total\n",
    negativeCandidate: "def sum_small_numbers(values):\n    total = 0\n    for value in values:\n        total = value\n    return total\n",
    testCode: "assert sum_small_numbers([1, 2, 3]) == 6\nassert sum_small_numbers([]) == 0\nassert sum_small_numbers([5, -2, 1]) == 4\n",
    model: "fallback-template"
  };
}

function loopTemplate(): GeneratedCandidate {
  return {
    title: "Self-study mini task: double each value",
    promptMarkdown: "Write `double_values(values)` to return a new list where each number from `values` has been doubled. Use a `for` loop.",
    targetConcepts: ["for_loops", "lists", "variables"],
    primaryConcept: "for_loops",
    difficulty: 1,
    starterCode: "def double_values(values):\n    raise NotImplementedError\n",
    referenceSolution: "def double_values(values):\n    result = []\n    for value in values:\n        result.append(value * 2)\n    return result\n",
    negativeCandidate: "def double_values(values):\n    return values\n",
    testCode: "assert double_values([1, 3]) == [2, 6]\nassert double_values([]) == []\n",
    model: "fallback-template"
  };
}

function conditionalTemplate(): GeneratedCandidate {
  return {
    title: "Self-study mini task: keep positive values",
    promptMarkdown: "Write `keep_positive(values)` to return a list containing only the values greater than zero.",
    targetConcepts: ["conditionals", "for_loops", "lists"],
    primaryConcept: "conditionals",
    difficulty: 2,
    starterCode: "def keep_positive(values):\n    raise NotImplementedError\n",
    referenceSolution: "def keep_positive(values):\n    result = []\n    for value in values:\n        if value > 0:\n            result.append(value)\n    return result\n",
    negativeCandidate: "def keep_positive(values):\n    return values\n",
    testCode: "assert keep_positive([1, -2, 3, 0]) == [1, 3]\nassert keep_positive([-1, 0]) == []\n",
    model: "fallback-template"
  };
}

function functionTemplate(): GeneratedCandidate {
  return {
    title: "Self-study mini task: greeting function",
    promptMarkdown: "Write `greet_name(name)` to return the string `Hello, <name>!`.",
    targetConcepts: ["functions", "strings", "variables"],
    primaryConcept: "functions",
    difficulty: 1,
    starterCode: "def greet_name(name):\n    raise NotImplementedError\n",
    referenceSolution: "def greet_name(name):\n    return f\"Hello, {name}!\"\n",
    negativeCandidate: "def greet_name(name):\n    return name\n",
    testCode: "assert greet_name('Ada') == 'Hello, Ada!'\nassert greet_name('Lin') == 'Hello, Lin!'\n",
    model: "fallback-template"
  };
}

function arithmeticTemplate(): GeneratedCandidate {
  return {
    title: "Self-study mini task: calculate a taxed price",
    promptMarkdown: "Write `add_tax(price, tax_rate)` to return the total price after adding tax. For example, `add_tax(100, 0.2)` should return `120`.",
    targetConcepts: ["variables", "arithmetic_operations", "functions"],
    primaryConcept: "arithmetic_operations",
    difficulty: 1,
    starterCode: "def add_tax(price, tax_rate):\n    raise NotImplementedError\n",
    referenceSolution: "def add_tax(price, tax_rate):\n    return price * (1 + tax_rate)\n",
    negativeCandidate: "def add_tax(price, tax_rate):\n    return price + tax_rate\n",
    testCode: "assert abs(add_tax(100, 0.2) - 120) < 1e-9\nassert abs(add_tax(50, 0.1) - 55) < 1e-9\n",
    model: "fallback-template"
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function safeId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "python_basics";
}

function hasExplicitTaskCue(markdown: string): boolean {
  const text = markdown.replace(/[`*_>]/g, " ");
  return /(?:^|\n)\s*(?:#{1,6}\s*)?(?:exercise|task|question|problem|goal|instructions?)\b/i.test(text)
    || /(?:^|[.!?]\s+|\n)\s*(?:write|implement|complete|define|calculate|return|practi[cs]e)\b/i.test(text)
    || /(?:^|\n)\s*(?:练习|任务|题目|问题|目标)/.test(text)
    || /(?:^|[。！？]\s*|\n)\s*请(?:编写|实现|完成|计算|返回)/.test(text);
}
