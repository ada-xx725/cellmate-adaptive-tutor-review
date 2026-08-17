import {
  AdaptiveAction,
  LlmFeedback,
  NextStepSupport,
  TaskSpec,
  TestEvidence
} from "./types";

export const NEXT_STEP_SUPPORT_PROMPT_VERSION = "next-step-support-v1";

interface JsonCompleter {
  completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined>;
}

interface RawSupport {
  instruction?: unknown;
  hint?: unknown;
  steps?: unknown;
  scaffold_code?: unknown;
}

export interface NextStepSupportInput {
  action: AdaptiveAction;
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  studentCode: string;
  feedback?: LlmFeedback;
}

export class NextStepSupportAgent {
  private readonly llm: JsonCompleter;

  constructor(llm?: JsonCompleter) {
    this.llm = llm ?? createDefaultLlmClient();
  }

  async generate(input: NextStepSupportInput): Promise<NextStepSupport | undefined> {
    if (input.action !== "HINT" && input.action !== "RETRY_WITH_SCAFFOLD") {
      return undefined;
    }

    const raw = await this.llm.completeJson<RawSupport>({
      system:
        "You create concise teaching support for a beginner Python learner. " +
        "Use only the supplied task, code, and evidence. Never provide a complete solution. Return valid JSON only.",
      prompt: buildNextStepSupportPrompt(input),
      timeoutMs: 15000
    });
    return normaliseSupport(raw, input.action) ?? fallbackSupport(input);
  }
}

export function buildNextStepSupportPrompt(input: NextStepSupportInput): string {
  const actionRules = input.action === "HINT"
    ? [
        "Return one targeted clue in `hint`.",
        "Do not return steps or scaffold_code.",
        "Do not reveal the exact final expression or a complete code line that solves the error."
      ]
    : [
        "Return 2 to 4 short ordered items in `steps`.",
        "Return an incomplete `scaffold_code` that helps organise the current task.",
        "The scaffold must contain an obvious placeholder such as `...`, `___`, or `TODO`.",
        "Do not return a complete executable solution."
      ];

  return [
    `Prompt version: ${NEXT_STEP_SUPPORT_PROMPT_VERSION}`,
    `Action: ${input.action}`,
    'Return schema: {"instruction":string,"hint"?:string,"steps"?:string[],"scaffold_code"?:string}.',
    ...actionRules,
    "",
    `Task: ${input.taskSpec.taskSummary}`,
    `Expected behaviour: ${input.taskSpec.expectedBehavior}`,
    `Exercise prompt: ${input.taskSpec.promptMarkdown}`,
    `Observed evidence: ${JSON.stringify(input.evidence)}`,
    `Existing feedback: ${input.feedback?.explanation ?? input.feedback?.diagnosis ?? "none"}`,
    "Student code:",
    input.studentCode
  ].join("\n");
}

export function normaliseSupport(
  raw: RawSupport | undefined,
  action: "HINT" | "RETRY_WITH_SCAFFOLD"
): NextStepSupport | undefined {
  if (!raw || typeof raw.instruction !== "string" || !raw.instruction.trim()) {
    return undefined;
  }
  const instruction = cleanText(raw.instruction, 400);
  if (looksLikeSolutionCode(instruction)) return undefined;

  if (action === "HINT") {
    if (typeof raw.hint !== "string" || !raw.hint.trim()) return undefined;
    const hint = cleanText(raw.hint, 600);
    if (looksLikeSolutionCode(hint)) return undefined;
    return {
      action,
      source: "llm",
      promptVersion: NEXT_STEP_SUPPORT_PROMPT_VERSION,
      instruction,
      hint
    };
  }

  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .filter((step): step is string => typeof step === "string")
        .map((step) => cleanText(step, 300))
        .filter(Boolean)
        .slice(0, 4)
    : [];
  if (
    steps.length < 2 ||
    steps.some(looksLikeSolutionCode) ||
    typeof raw.scaffold_code !== "string"
  ) return undefined;
  const scaffoldCode = raw.scaffold_code.trim().slice(0, 2000);
  if (!hasPlaceholder(scaffoldCode) || looksLikeCompleteScaffold(scaffoldCode)) {
    return undefined;
  }
  return {
    action,
    source: "llm",
    promptVersion: NEXT_STEP_SUPPORT_PROMPT_VERSION,
    instruction,
    steps,
    scaffoldCode
  };
}

export function fallbackSupport(input: NextStepSupportInput): NextStepSupport {
  const missingName = extractMissingName(
    `${input.evidence.summary}\n${input.feedback?.diagnosis ?? ""}\n${input.feedback?.explanation ?? ""}`
  );

  if (input.action === "HINT") {
    const hint = missingName
      ? `\`${missingName}\` is being used before it has a value. Look at the exercise description, work out what that name represents, and assign it before the line that uses it.`
      : "Follow the value that fails the check backwards through your code. Find the first assignment where it becomes different from the expected behaviour.";
    return {
      action: "HINT",
      source: "local_fallback",
      promptVersion: NEXT_STEP_SUPPORT_PROMPT_VERSION,
      instruction: "Focus on the first missing value without changing the rest of the solution yet.",
      hint
    };
  }

  const name = missingName ?? "missing_value";
  const steps = missingName
    ? [
        `Find the first line that uses \`${name}\`.`,
        `Use the exercise description to identify what \`${name}\` should represent.`,
        `Calculate and assign \`${name}\` before it is used, then run the check again.`
      ]
    : [
        "Read the first failing message and identify the value it is checking.",
        "Trace that value back to the line where it is calculated.",
        "Complete only that calculation, then run the same check again."
      ];
  return {
    action: "RETRY_WITH_SCAFFOLD",
    source: "local_fallback",
    promptVersion: NEXT_STEP_SUPPORT_PROMPT_VERSION,
    instruction: "Keep the current exercise, but complete it in these smaller steps.",
    steps,
    scaffoldCode: `# Calculate the missing intermediate value before it is used.\n${name} = ...  # replace ... with your expression\n\n# Then keep your existing calculation below and use ${name}.`
  };
}

function extractMissingName(text: string): string | undefined {
  return text.match(/name\s+['"`]([A-Za-z_]\w*)['"`]\s+is\s+not\s+defined/i)?.[1]
    ?? text.match(/['"`]([A-Za-z_]\w*)['"`]\s+is\s+undefined/i)?.[1];
}

function cleanText(value: string, limit: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function hasPlaceholder(code: string): boolean {
  return /\.\.\.|___|TODO|NotImplementedError/.test(code);
}

function looksLikeSolutionCode(value: string): boolean {
  return /```|(^|\n)\s*(def|class|return|import|from)\b|\b[A-Za-z_]\w*\s*=/.test(value);
}

function looksLikeCompleteScaffold(code: string): boolean {
  return !code
    .split(/\r?\n/)
    .some((line) => !line.trimStart().startsWith("#") && hasPlaceholder(line));
}

function createDefaultLlmClient(): JsonCompleter {
  // Keep this module importable in ordinary Node tests.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AdaptiveLlmClient } = require("./llmClient") as typeof import("./llmClient");
  return new AdaptiveLlmClient();
}
