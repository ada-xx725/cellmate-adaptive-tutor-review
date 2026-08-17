import { reasonsEvidenceIsInsufficient } from "./policy";
import { AdaptiveAction } from "./types";
import { DecisionInput } from "./core/decisionEngine";

export const LLM_NEXT_STEP_PROMPT_VERSION = "llm-next-step-v6";

const ACTIONS: AdaptiveAction[] = [
  "HINT",
  "RETRY_WITH_SCAFFOLD",
  "EASIER",
  "SIMILAR",
  "HARDER",
  "NEXT_CONCEPT"
];

interface JsonCompleter {
  completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined>;
}

interface RawLlmNextStepSelection {
  action?: unknown;
  reason?: unknown;
  evidence_reference_ids?: unknown;
  confidence?: unknown;
}

export interface DecisionEvidenceCatalogEntry {
  id: string;
  kind: "current_check" | "mastery" | "history" | "course";
  value: string;
}

export interface LlmNextStepSelection {
  action: AdaptiveAction;
  reason: string;
  evidenceReferences: string[];
  confidence: number;
}

export class LlmNextStepSelector {
  private readonly llm: JsonCompleter;

  constructor(llm?: JsonCompleter) {
    this.llm = llm ?? createDefaultLlmClient();
  }

  async select(input: DecisionInput): Promise<LlmNextStepSelection | undefined> {
    if (reasonsEvidenceIsInsufficient(input.evidence).length) return undefined;

    const system =
      "You select one pedagogical next action for a beginner Python learner. " +
      "Use only the supplied evidence. Do not invent test outcomes, course exercises, or learner history. " +
      "Return valid JSON only.";
    const prompt = buildLlmNextStepPrompt(input);
    const raw = await this.llm.completeJson<RawLlmNextStepSelection>({
      system,
      prompt,
      timeoutMs: 15000
    });

    const selected = normaliseSelection(raw, input);
    if (selected) return selected;

    const repaired = await this.llm.completeJson<RawLlmNextStepSelection>({
      system:
        system +
        " Your previous response was rejected. Select only from the allowed actions and evidence IDs for this input.",
      prompt:
        prompt +
        "\nThe previous response was invalid. Re-read the constraints and return a corrected JSON response.",
      timeoutMs: 15000
    });
    return normaliseSelection(repaired, input);
  }
}

export function buildLlmNextStepPrompt(input: DecisionInput): string {
  const recentHistory = input.history.slice(-5).map((attempt) => ({
    exerciseId: attempt.exerciseId,
    action: attempt.action,
    evidenceStatus: attempt.evidence.status,
    evidenceSummary: attempt.evidence.summary,
    createdAt: attempt.createdAt
  }));

  const evidenceCatalog = buildDecisionEvidenceCatalog(input);
  return [
    `Prompt version: ${LLM_NEXT_STEP_PROMPT_VERSION}`,
    'Return schema: {"action":"HINT|RETRY_WITH_SCAFFOLD|EASIER|SIMILAR|HARDER|NEXT_CONCEPT","reason":string,"evidence_reference_ids":string[],"confidence":number}.',
    "evidence_reference_ids must contain 1-5 unique IDs copied exactly from the evidence catalog.",
    "Every action must reference check:current. HARDER and NEXT_CONCEPT must also reference mastery evidence. NEXT_CONCEPT must reference course evidence when it is available.",
    "Action meanings:",
    "- HINT: keep the current task and give one targeted clue. Prefer this for a first reliable failure when the evidence identifies one local name, expression, or line to fix.",
    "- RETRY_WITH_SCAFFOLD: keep the current task and provide ordered steps plus incomplete code structure. Use this when several steps are missing, the learner appears unsure how to organise the solution, or a previous HINT did not resolve the problem.",
    "- EASIER: move to a smaller prerequisite task. Use this when support on the current task has already failed or the evidence shows a prerequisite gap.",
    "- SIMILAR: practise the same concept at a comparable level.",
    "- HARDER: practise the same concept with one additional challenge.",
    "- NEXT_CONCEPT: move forward to a new course concept.",
    "Choose the least intensive action that is still likely to help.",
    "Do not choose RETRY_WITH_SCAFFOLD merely because the current task failed; a single local error normally needs HINT first.",
    "Do not repeat HINT after a failed attempt that already received HINT. Escalate to RETRY_WITH_SCAFFOLD.",
    "Do not repeat RETRY_WITH_SCAFFOLD after it failed to resolve the same task. Escalate to EASIER.",
    "A failed current task must not produce HARDER or NEXT_CONCEPT.",
    "A passed current task must not produce HINT, RETRY_WITH_SCAFFOLD, or EASIER.",
    "Progression constraints for a passed task:",
    "- Average mastery below 70: stay on the current concept. Do not choose HARDER or NEXT_CONCEPT.",
    "- Average mastery from 70 to below 85: HARDER may be appropriate, but do not choose NEXT_CONCEPT.",
    "- Average mastery of at least 85: NEXT_CONCEPT may be appropriate when the evidence, history, and context support it.",
    "One successful attempt does not by itself prove that a concept is mastered.",
    `Allowed actions for this input after applying the hard constraints: ${allowedActions(input).join(", ")}.`,
    "",
    `Task: ${input.taskSpec.taskSummary}`,
    `Expected behaviour: ${input.taskSpec.expectedBehavior}`,
    `Source mode: ${input.taskSpec.sourceMode}`,
    `Concepts: ${input.taskSpec.targetConcepts.join(", ")}`,
    `Primary concept: ${input.taskSpec.primaryConcept}`,
    `Difficulty: ${input.taskSpec.difficulty}`,
    `Evidence: ${JSON.stringify(input.evidence)}`,
    `Learner mastery before this attempt: ${JSON.stringify(input.learnerBefore.mastery)}`,
    `Recent attempts: ${JSON.stringify(recentHistory)}`,
    `Course context: ${JSON.stringify(input.courseContext ?? {})}`,
    `Evidence catalog: ${JSON.stringify(evidenceCatalog)}`
  ].join("\n");
}

export function buildDecisionEvidenceCatalog(input: DecisionInput): DecisionEvidenceCatalogEntry[] {
  const entries: DecisionEvidenceCatalogEntry[] = [{
    id: "check:current",
    kind: "current_check",
    value: JSON.stringify({
      status: input.evidence.status,
      source: input.evidence.source ?? "unknown",
      confidence: input.evidence.confidence ?? "unknown",
      reliable: input.evidence.hasReliableCheck !== false,
      summary: input.evidence.summary.slice(0, 500)
    })
  }];

  for (const concept of Array.from(new Set(input.taskSpec.targetConcepts))) {
    entries.push({
      id: `mastery:${referenceComponent(concept)}`,
      kind: "mastery",
      value: String(input.learnerBefore.mastery[concept] ?? 50)
    });
  }
  for (const attempt of input.history.slice(-5)) {
    entries.push({
      id: `history:${referenceComponent(attempt.fingerprint)}`,
      kind: "history",
      value: JSON.stringify({
        exerciseId: attempt.exerciseId,
        action: attempt.action,
        evidenceStatus: attempt.evidence.status,
        createdAt: attempt.createdAt
      })
    });
  }
  if (input.courseContext?.exerciseId) {
    entries.push({
      id: `course:${referenceComponent(input.courseContext.exerciseId)}`,
      kind: "course",
      value: JSON.stringify(input.courseContext)
    });
  }
  return uniqueCatalog(entries);
}

function normaliseSelection(
  raw: RawLlmNextStepSelection | undefined,
  input: DecisionInput
): LlmNextStepSelection | undefined {
  if (!raw || !isAdaptiveAction(raw.action)) return undefined;
  if (actionConflictsWithEvidence(raw.action, input)) return undefined;
  if (actionConflictsWithProgression(raw.action, input)) return undefined;
  if (typeof raw.reason !== "string" || !raw.reason.trim()) return undefined;
  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence)) return undefined;
  const evidenceReferences = validateEvidenceReferenceIds(raw.evidence_reference_ids, raw.action, input);
  if (!evidenceReferences) return undefined;

  return {
    action: raw.action,
    reason: raw.reason.trim().replace(/\s+/g, " ").slice(0, 1000),
    evidenceReferences,
    confidence: Math.max(0, Math.min(1, raw.confidence))
  };
}

function validateEvidenceReferenceIds(
  rawReferences: unknown,
  action: AdaptiveAction,
  input: DecisionInput
): string[] | undefined {
  if (!Array.isArray(rawReferences) || rawReferences.length < 1 || rawReferences.length > 5) return undefined;
  if (rawReferences.some((item) => typeof item !== "string" || item !== item.trim() || /[\r\n]/.test(item))) return undefined;
  const references = rawReferences as string[];
  if (new Set(references).size !== references.length) return undefined;

  const catalog = buildDecisionEvidenceCatalog(input);
  const allowed = new Map(catalog.map((entry) => [entry.id, entry]));
  if (references.some((reference) => !allowed.has(reference))) return undefined;
  if (!references.includes("check:current")) return undefined;
  if ((action === "HARDER" || action === "NEXT_CONCEPT")
    && !references.some((reference) => allowed.get(reference)?.kind === "mastery")) return undefined;
  if (action === "NEXT_CONCEPT"
    && catalog.some((entry) => entry.kind === "course")
    && !references.some((reference) => allowed.get(reference)?.kind === "course")) return undefined;
  return references;
}

function referenceComponent(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%3A/gi, ":");
}

function uniqueCatalog(entries: DecisionEvidenceCatalogEntry[]): DecisionEvidenceCatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function isAdaptiveAction(value: unknown): value is AdaptiveAction {
  return typeof value === "string" && ACTIONS.includes(value as AdaptiveAction);
}

function actionConflictsWithEvidence(action: AdaptiveAction, input: DecisionInput): boolean {
  if (input.evidence.status === "failed") {
    return action === "HARDER" || action === "NEXT_CONCEPT";
  }
  if (input.evidence.status === "passed") {
    return action === "HINT" || action === "RETRY_WITH_SCAFFOLD" || action === "EASIER";
  }
  return true;
}

function actionConflictsWithProgression(action: AdaptiveAction, input: DecisionInput): boolean {
  if (input.evidence.status !== "passed") return false;
  const scores = input.taskSpec.targetConcepts.map((concept) => input.learnerBefore.mastery[concept] ?? 50);
  const averageMastery = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
  if (averageMastery < 70) return action === "HARDER" || action === "NEXT_CONCEPT";
  if (averageMastery < 85) return action === "NEXT_CONCEPT";
  return false;
}

function allowedActions(input: DecisionInput): AdaptiveAction[] {
  return ACTIONS.filter(
    (action) => !actionConflictsWithEvidence(action, input) && !actionConflictsWithProgression(action, input)
  );
}

function createDefaultLlmClient(): JsonCompleter {
  // Load the VS Code-dependent client lazily so ordinary Node unit tests can
  // import and test this selector without the Extension Host runtime.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AdaptiveLlmClient } = require("./llmClient") as typeof import("./llmClient");
  return new AdaptiveLlmClient();
}
