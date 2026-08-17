import { randomUUID } from "crypto";
import { canonicalConceptId, canonicalConcepts } from "./concepts";
import { AdaptiveAction, CourseExercise, GeneratedCandidate, GeneratedExercise } from "./types";
import { AdaptiveLlmClient } from "./llmClient";

const PROMPT_VERSION = "course-grounded-v2";

export class ConstrainedExerciseGenerator {
  constructor(private readonly llm = new AdaptiveLlmClient()) {}

  async generate(input: {
    parent: CourseExercise;
    action: AdaptiveAction;
    context: string;
  }): Promise<GeneratedExercise> {
    const candidate = await this.generateWithLlm(input) ?? fallbackCandidate(input.parent, input.action);
    return this.toGeneratedExercise(input.parent, input.action, candidate);
  }

  generateFallback(input: {
    parent: CourseExercise;
    action: AdaptiveAction;
  }): GeneratedExercise {
    return {
      ...this.toGeneratedExercise(input.parent, input.action, fallbackCandidate(input.parent, input.action)),
      fallbackUsed: true,
      validationStatus: "fallback"
    };
  }

  private toGeneratedExercise(parent: CourseExercise, action: AdaptiveAction, candidate: GeneratedCandidate): GeneratedExercise {
    const rootParentId = parent.origin === "generated" && parent.parentId ? parent.parentId : parent.id;
    const id = `generated:${rootParentId}:${action.toLowerCase()}:${randomUUID()}`;
    const targetConcepts = canonicalConcepts(candidate.targetConcepts, parent.targetConcepts);
    return {
      id,
      origin: "generated",
      parentId: rootParentId,
      action,
      title: candidate.title,
      promptMarkdown: candidate.promptMarkdown,
      targetConcepts,
      primaryConcept: candidate.primaryConcept ? canonicalConceptId(candidate.primaryConcept) : choosePrimaryConcept(targetConcepts, parent.primaryConcept),
      difficulty: candidate.difficulty ?? nextDifficulty(parent.difficulty, action),
      starterCode: withExerciseId(id, candidate.starterCode),
      referenceSolution: candidate.referenceSolution,
      negativeCandidate: candidate.negativeCandidate,
      testCode: candidate.testCode,
      model: candidate.model,
      promptVersion: PROMPT_VERSION,
      createdAt: new Date().toISOString(),
      validated: false
    };
  }

  async repair(input: {
    exercise: GeneratedExercise;
    validationSummary: string;
  }): Promise<GeneratedExercise | undefined> {
    if (input.exercise.model === "fallback-template") return undefined;
    const repaired = await this.llm.completeJson<GeneratedCandidate>({
      system: "You repair invalid generated Python exercises. Return valid JSON only.",
      prompt: `The generated exercise failed validation.\nValidation summary:\n${input.validationSummary}\n\n` +
        `Repair only invalid parts while preserving the target concepts and beginner difficulty.\n` +
        `Schema: {"title":string,"promptMarkdown":string,"targetConcepts":string[],"primaryConcept":string,"difficulty":number,"starterCode":string,"referenceSolution":string,"negativeCandidate":string,"testCode":string}.\n` +
        `Tests must be plain Python assert statements and use no dependencies except math.\n\n` +
        `Current exercise:\n${JSON.stringify(input.exercise)}`
    });
    if (!repaired || !isCandidate(repaired)) return undefined;
    return {
      ...this.toGeneratedExercise(parentFromGenerated(input.exercise), input.exercise.action, { ...repaired, model: `${input.exercise.model}:repair` }),
      validationStatus: "repaired"
    };
  }

  private async generateWithLlm(input: { parent: CourseExercise; action: AdaptiveAction; context: string }): Promise<GeneratedCandidate | undefined> {
    const prompt = `Return JSON only. Create a small Python learning exercise constrained by the supplied course context.\n` +
      `Parent exercise: ${input.parent.id} — ${input.parent.title}\nAction: ${input.action}\nTarget concepts: ${canonicalConcepts(input.parent.targetConcepts).join(", ")}\nCourse context: ${input.context.slice(0, 6000)}\n` +
      `Use canonical concept IDs where possible: variables, arithmetic_operations, for_loops, accumulators, conditionals, functions, lists.\n` +
      `Schema: {"title":string,"promptMarkdown":string,"targetConcepts":string[],"primaryConcept":string,"difficulty":number,"starterCode":string,"referenceSolution":string,"testCode":string}. ` +
      `testCode must be Python assert statements. Do not import packages other than math.`;
    const completion = await this.llm.completeJsonWithModel<GeneratedCandidate>({
      system: "You generate small, course-grounded Python practice exercises. Return valid JSON only.",
      prompt
    });
    return completion && isCandidate(completion.value)
      ? { ...completion.value, model: completion.modelName }
      : undefined;
  }
}

function parentFromGenerated(exercise: GeneratedExercise): CourseExercise {
  return {
    id: exercise.parentId,
    origin: "generic",
    title: exercise.title,
    promptMarkdown: exercise.promptMarkdown,
    targetConcepts: exercise.targetConcepts
  };
}

function withExerciseId(id: string, code: string): string {
  return `# EXERCISE_ID: ${id}\n# Generated by CellMate Adaptive Next Step\n${code.replace(/^# EXERCISE_ID:.*\n?/m, "")}`;
}

function isCandidate(value: GeneratedCandidate): boolean {
  return Boolean(value && value.title && value.promptMarkdown && Array.isArray(value.targetConcepts) && value.starterCode && value.referenceSolution && value.testCode);
}

function choosePrimaryConcept(concepts: string[], parentPrimary?: string): string {
  if (concepts.includes("accumulators")) return "accumulators";
  if (concepts.includes("conditionals")) return "conditionals";
  if (concepts.includes("for_loops")) return "for_loops";
  if (parentPrimary) return canonicalConceptId(parentPrimary);
  return concepts[0] ?? "python_basics";
}

function nextDifficulty(parentDifficulty: number | undefined, action: AdaptiveAction): number {
  const base = parentDifficulty ?? 1;
  if (action === "EASIER") return Math.max(1, base - 1);
  if (action === "HARDER" || action === "NEXT_CONCEPT") return Math.min(5, base + 1);
  return base;
}

function fallbackCandidate(parent: CourseExercise, action: AdaptiveAction): GeneratedCandidate {
  if (parent.id === "exercise-1_2" || parent.parentId === "exercise-1_2") {
    return lengthConversionFallback(action);
  }

  if (action === "EASIER") {
    return {
      title: "Update a running total",
      promptMarkdown: "Write `update_total(total, value)` to return the new running total after adding `value`. This isolates the smallest accumulator step before using it inside a loop.",
      targetConcepts: ["variables", "accumulators", "arithmetic_operations"],
      primaryConcept: "accumulators",
      difficulty: 1,
      starterCode: "def update_total(total, value):\n    raise NotImplementedError\n",
      referenceSolution: "def update_total(total, value):\n    return total + value\n",
      negativeCandidate: "def update_total(total, value):\n    return value\n",
      testCode: "assert update_total(0, 4) == 4\nassert update_total(5, -2) == 3\n",
      model: "fallback-template"
    };
  }

  if (action === "HARDER" || action === "NEXT_CONCEPT") {
    return {
      title: "Running totals with a condition",
      promptMarkdown: "Write `sum_positive(values)` to return the sum of values greater than zero. Keep a running total and update it only when the condition is true.",
      targetConcepts: ["for_loops", "conditionals", "accumulators"],
      primaryConcept: "accumulators",
      difficulty: Math.min(5, (parent.difficulty ?? 1) + 1),
      starterCode: "def sum_positive(values):\n    raise NotImplementedError\n",
      referenceSolution: "def sum_positive(values):\n    total = 0\n    for value in values:\n        if value > 0:\n            total += value\n    return total\n",
      negativeCandidate: "def sum_positive(values):\n    total = 0\n    for value in values:\n        total += value\n    return total\n",
      testCode: "assert sum_positive([1, -2, 3]) == 4\nassert sum_positive([]) == 0\n",
      model: "fallback-template"
    };
  }
  return {
    title: "Sum values with a loop",
    promptMarkdown: "Write `sum_values(values)` to return the sum of all numbers in `values`. Use a running total that starts at zero and update it inside a `for` loop.",
    targetConcepts: ["for_loops", "accumulators", "variables"],
    primaryConcept: "accumulators",
    difficulty: parent.difficulty ?? 1,
    starterCode: "def sum_values(values):\n    raise NotImplementedError\n",
    referenceSolution: "def sum_values(values):\n    total = 0\n    for value in values:\n        total += value\n    return total\n",
    negativeCandidate: "def sum_values(values):\n    total = 0\n    for value in values:\n        total = value\n    return total\n",
    testCode: "assert sum_values([2, 3, 4]) == 9\nassert sum_values([]) == 0\nassert sum_values([5, -2, 1]) == 4\n",
    model: "fallback-template"
  };
}

function lengthConversionFallback(action: AdaptiveAction): GeneratedCandidate {
  if (action === "EASIER") {
    return {
      title: "Practise one metric-to-imperial conversion",
      promptMarkdown: "Write `metres_to_feet(metres)` to convert a length in metres into feet. Use `1 inch = 0.0254 metres` and `1 foot = 12 inches`.",
      targetConcepts: ["python_basics", "variables"],
      primaryConcept: "arithmetic_operations",
      difficulty: 1,
      starterCode: "def metres_to_feet(metres):\n    raise NotImplementedError\n",
      referenceSolution: "def metres_to_feet(metres):\n    inches = metres / 0.0254\n    feet = inches / 12\n    return feet\n",
      negativeCandidate: "def metres_to_feet(metres):\n    return metres / 12\n",
      testCode: "assert abs(metres_to_feet(0.3048) - 1) < 1e-9\nassert abs(metres_to_feet(1.524) - 5) < 1e-9\n",
      model: "fallback-template"
    };
  }

  if (action === "NEXT_CONCEPT") {
    return {
      title: "Format a metric conversion result",
      promptMarkdown: "Write `describe_length(metres)` to return a string like `\"2.00 metres is 78.74 inches\"`. This keeps the conversion idea and moves into formatted output.",
      targetConcepts: ["python_basics", "variables", "formatted_output"],
      primaryConcept: "formatted_output",
      difficulty: 2,
      starterCode: "def describe_length(metres):\n    raise NotImplementedError\n",
      referenceSolution: "def describe_length(metres):\n    inches = metres / 0.0254\n    return f\"{metres:.2f} metres is {inches:.2f} inches\"\n",
      negativeCandidate: "def describe_length(metres):\n    return str(metres / 0.0254)\n",
      testCode: "assert describe_length(2) == \"2.00 metres is 78.74 inches\"\nassert describe_length(0.0254) == \"0.03 metres is 1.00 inches\"\n",
      model: "fallback-template"
    };
  }

  return {
    title: "Convert metres and centimetres to imperial units",
    promptMarkdown: "Write `convert_metric_length(metres, centimetres)` to combine metres and centimetres into one length, then return `(inches, feet, yards, miles)`. This is a harder version of Exercise 1.2 because the metric length has two parts.",
    targetConcepts: ["python_basics", "variables"],
    primaryConcept: "arithmetic_operations",
    difficulty: 2,
    starterCode: "def convert_metric_length(metres, centimetres):\n    raise NotImplementedError\n",
    referenceSolution: "def convert_metric_length(metres, centimetres):\n    total_metres = metres + centimetres / 100\n    inches = total_metres / 0.0254\n    feet = inches / 12\n    yards = feet / 3\n    miles = yards / 1760\n    return inches, feet, yards, miles\n",
    negativeCandidate: "def convert_metric_length(metres, centimetres):\n    inches = metres / 0.0254\n    feet = inches / 12\n    yards = feet / 3\n    miles = yards / 1760\n    return inches, feet, yards, miles\n",
    testCode: "result = convert_metric_length(1, 27)\nassert len(result) == 4\nassert abs(result[0] - 50) < 1e-9\nassert abs(result[1] - (50 / 12)) < 1e-9\nassert abs(result[2] - (50 / 36)) < 1e-9\nassert abs(result[3] - (50 / 63360)) < 1e-12\n",
    model: "fallback-template"
  };
}
