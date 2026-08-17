import { createHash } from "crypto";
import { canonicalConceptId, canonicalConcepts } from "./concepts";
import { TaskSpec } from "./types";
import { fallbackTaskSpecFromGoal } from "./selfStudyTemplates";

interface JsonCompleter {
  completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined>;
}

interface GoalTaskJson {
  task_summary?: string;
  expected_behavior?: string;
  target_concepts?: string[];
  primary_concept?: string;
  difficulty?: number;
  expected_function?: string;
}

export class GoalToTaskSpecAgent {
  private readonly llm: JsonCompleter;

  constructor(llm?: JsonCompleter) {
    this.llm = llm ?? createDefaultLlmClient();
  }

  async infer(goal: string): Promise<TaskSpec> {
    const llmSpec = await this.llm.completeJson<GoalTaskJson>({
      system: "You turn a short beginner Python learning goal into one small practice task specification. Return valid JSON only.",
      prompt: `Learning goal: ${goal}\n\n` +
        `Return schema: {"task_summary":string,"expected_behavior":string,"target_concepts":string[],"primary_concept":string,"difficulty":number,"expected_function":string}.\n` +
        `Keep it to one mini exercise, not a syllabus or lesson plan.`,
      timeoutMs: 12000
    });
    return normaliseGoalSpec(goal, llmSpec);
  }
}

function createDefaultLlmClient(): JsonCompleter {
  // Load lazily so plain Node tests do not need the VS Code extension host.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AdaptiveLlmClient } = require("./llmClient") as typeof import("./llmClient");
  return new AdaptiveLlmClient();
}

function normaliseGoalSpec(goal: string, llmSpec?: GoalTaskJson): TaskSpec {
  if (!llmSpec || !llmSpec.task_summary || !Array.isArray(llmSpec.target_concepts)) {
    return fallbackTaskSpecFromGoal(goal);
  }
  const fallback = fallbackTaskSpecFromGoal(goal);
  const concepts = canonicalConcepts(cleanConcepts(llmSpec.target_concepts), fallback.targetConcepts);
  return {
    id: `selfstudy-goal:${hash(goal)}`,
    sourceMode: "self_study_goal",
    learningGoal: goal,
    taskSummary: llmSpec.task_summary,
    expectedBehavior: llmSpec.expected_behavior ?? llmSpec.task_summary,
    title: llmSpec.task_summary,
    promptMarkdown: `Goal: ${goal}`,
    targetConcepts: concepts,
    primaryConcept: llmSpec.primary_concept ? canonicalConceptId(llmSpec.primary_concept) : concepts[0] || fallback.primaryConcept,
    difficulty: clampNumber(llmSpec.difficulty, 1, 3, fallback.difficulty),
    confidence: 0.75,
    expectedFunction: llmSpec.expected_function
  };
}

function cleanConcepts(concepts?: string[]): string[] | undefined {
  const cleaned = concepts?.map((concept) => concept.trim()).filter(Boolean);
  return cleaned?.length ? Array.from(new Set(cleaned)).slice(0, 5) : undefined;
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
