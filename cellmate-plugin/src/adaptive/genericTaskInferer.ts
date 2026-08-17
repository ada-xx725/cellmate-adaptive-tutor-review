import { createHash } from "crypto";
import { canonicalConceptId, canonicalConcepts } from "./concepts";
import { NotebookContext, TaskSpec } from "./types";

interface JsonCompleter {
  completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined>;
}

interface LlmTaskSpec {
  task_summary?: string;
  expected_behavior?: string;
  target_concepts?: string[];
  primary_concept?: string;
  difficulty?: number;
  confidence?: number;
  expected_function?: string;
}

export class GenericTaskInferer {
  private readonly llm: JsonCompleter;

  constructor(llm?: JsonCompleter) {
    this.llm = llm ?? createDefaultLlmClient();
  }

  async infer(context: NotebookContext, explicitTaskStatement: string): Promise<TaskSpec> {
    const taskStatement = explicitTaskStatement.trim();
    if (!taskStatement) throw new Error("Explicit task intent is required before generic task inference.");
    const llmSpec = await this.llm.completeJson<LlmTaskSpec>({
      system: "You normalise an explicit beginner Python task. Return valid JSON only and do not invent requirements or tests.",
      prompt: `The explicit task statement below is the only authority for expected behaviour.\n` +
        `Use code only to identify concepts or a named function; never infer extra requirements from it.\n` +
        `Return schema: {"task_summary":string,"expected_behavior":string,"target_concepts":string[],"primary_concept":string,"difficulty":number,"confidence":number,"expected_function":string}.\n\n` +
        `Explicit task statement:\n${taskStatement.slice(0, 4000)}\n\n` +
        `Student code (possibly incomplete):\n${context.currentCode.slice(0, 3000)}`
    });
    return normaliseTaskSpec(context, taskStatement, llmSpec);
  }
}

function createDefaultLlmClient(): JsonCompleter {
  // Load the VS Code-dependent client lazily so ordinary Node unit tests can
  // import this module without requiring the extension host's `vscode` module.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AdaptiveLlmClient } = require("./llmClient") as typeof import("./llmClient");
  return new AdaptiveLlmClient();
}

function normaliseTaskSpec(context: NotebookContext, taskStatement: string, llmSpec?: LlmTaskSpec): TaskSpec {
  const prompt = taskStatement;
  const expectedFunction = llmSpec?.expected_function || context.currentCode.match(/def\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  const concepts = canonicalConcepts(cleanConcepts(llmSpec?.target_concepts), inferConcepts(`${prompt}\n${context.currentCode}`));
  const primaryConcept = llmSpec?.primary_concept ? canonicalConceptId(llmSpec.primary_concept) : concepts[0] || "python_basics";
  const taskSummary = llmSpec?.task_summary || firstSentence(prompt) || `Complete ${expectedFunction ?? "the selected Python task"}.`;
  return {
    id: `generic:${hash(`${context.notebookUri}|${context.cellIndex}|${taskSummary}`)}`,
    sourceMode: "generic_llm",
    taskSummary,
    expectedBehavior: prompt,
    title: taskSummary,
    promptMarkdown: prompt,
    targetConcepts: concepts,
    primaryConcept,
    difficulty: clampNumber(llmSpec?.difficulty, 1, 5, 2),
    confidence: clampNumber(llmSpec?.confidence, 0, 1, llmSpec ? 0.65 : 0.7),
    expectedFunction
  };
}

function cleanConcepts(concepts?: string[]): string[] | undefined {
  const cleaned = concepts?.map((concept) => concept.trim()).filter(Boolean);
  return cleaned?.length ? Array.from(new Set(cleaned)).slice(0, 5) : undefined;
}

function inferConcepts(text: string): string[] {
  const lower = text.toLowerCase();
  const concepts = [
    ["functions", /def\s|function/],
    ["for_loops", /for |while |loop/],
    ["conditionals", /if |condition/],
    ["lists", /list|\[\]|array/],
    ["dictionaries", /dict|dictionary/],
    ["accumulators", /sum|total|accumulat|running/],
    ["files", /file|read/],
    ["classes", /class |object/]
  ].filter(([, pattern]) => (pattern as RegExp).test(lower)).map(([concept]) => concept as string);
  return concepts.length ? concepts : ["python_basics"];
}

function firstSentence(text: string): string | undefined {
  return text.replace(/[#*_`]/g, "").split(/[.!?\n]/).map((part) => part.trim()).find(Boolean);
}

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
