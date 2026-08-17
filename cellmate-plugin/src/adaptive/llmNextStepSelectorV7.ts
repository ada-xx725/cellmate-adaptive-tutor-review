import {
  buildConstrainedDecisionPlan,
  ConstrainedDecisionPlan
} from "./constrainedDecisionPlan";
import { masteryFor } from "./concepts";
import { AdaptiveAction } from "./types";
import { DecisionInput } from "./core/decisionEngine";

export const LLM_NEXT_STEP_PROMPT_VERSION_V7 = "llm-next-step-v7";

interface JsonCompleter {
  completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined>;
}

interface RawConstrainedSelection {
  action?: unknown;
  reason?: unknown;
  evidence_reference_ids?: unknown;
  confidence?: unknown;
}

export interface ConstrainedDecisionEvidenceCatalogEntry {
  id: string;
  kind: "current_check" | "coverage" | "mastery" | "history" | "course";
  value: string;
}

export interface ConstrainedLlmNextStepSelection {
  action: AdaptiveAction;
  reason: string;
  evidenceReferences: string[];
  confidence: number;
}

export class LlmNextStepSelectorV7 {
  private readonly llm: JsonCompleter;

  constructor(llm?: JsonCompleter) {
    this.llm = llm ?? createDefaultLlmClient();
  }

  async select(input: DecisionInput): Promise<ConstrainedLlmNextStepSelection | undefined> {
    const plan = buildConstrainedDecisionPlan(input);
    if (plan.status === "needs_evidence") return undefined;

    const system =
      "You select one pedagogical next action for a beginner Python learner. " +
      "The supplied action plan is an executable safety boundary: select only an allowed action. " +
      "Use only the supplied evidence, and return valid JSON only.";
    const prompt = buildLlmNextStepPromptV7(input, plan);
    const first = await this.llm.completeJson<RawConstrainedSelection>({
      system,
      prompt,
      timeoutMs: 15000
    });
    const selected = normaliseSelection(first, input, plan);
    if (selected) return selected;

    const repaired = await this.llm.completeJson<RawConstrainedSelection>({
      system:
        system +
        " Your previous response was rejected. Copy one action from allowed_actions and use only catalog evidence IDs.",
      prompt:
        prompt +
        "\nThe previous response violated the action mask, schema, or evidence provenance. Return one corrected JSON object.",
      timeoutMs: 15000
    });
    return normaliseSelection(repaired, input, plan);
  }
}

export function buildLlmNextStepPromptV7(
  input: DecisionInput,
  suppliedPlan?: ConstrainedDecisionPlan
): string {
  const plan = suppliedPlan ?? buildConstrainedDecisionPlan(input);
  if (plan.status === "needs_evidence") {
    throw new Error("The v7 selector prompt cannot be built for insufficient evidence.");
  }
  const catalog = buildConstrainedDecisionEvidenceCatalog(input);
  return [
    `Prompt version: ${LLM_NEXT_STEP_PROMPT_VERSION_V7}`,
    'Return schema: {"action":string,"reason":string,"evidence_reference_ids":string[],"confidence":number}.',
    "evidence_reference_ids must contain 1-6 unique IDs copied exactly from the evidence catalog.",
    `allowed_actions: ${JSON.stringify(plan.allowedActions)}`,
    `safe_default_action: ${plan.defaultAction}`,
    `canonical_facts: ${JSON.stringify(plan.facts)}`,
    "Select only from allowed_actions. The list already applies evidence, coverage, support-escalation, mastery, and course-target constraints.",
    "Every action must cite check:current.",
    "HARDER and NEXT_CONCEPT must cite mastery evidence.",
    "NEXT_CONCEPT must cite course evidence.",
    "When canonical_facts.coverageScope is narrow, cite coverage:current.",
    "When the action responds to failed prior support, cite the relevant history evidence.",
    "Choose the action most likely to help; if allowed_actions has one item, return that item.",
    "Do not invent test outcomes, uncovered categories, course targets, learner mastery, or history.",
    "",
    `Task: ${input.taskSpec.taskSummary}`,
    `Expected behaviour: ${input.taskSpec.expectedBehavior}`,
    `Evidence catalog: ${JSON.stringify(catalog)}`
  ].join("\n");
}

export function buildConstrainedDecisionEvidenceCatalog(
  input: DecisionInput
): ConstrainedDecisionEvidenceCatalogEntry[] {
  const plan = buildConstrainedDecisionPlan(input);
  const entries: ConstrainedDecisionEvidenceCatalogEntry[] = [{
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
  if (input.evidence.coverage) {
    entries.push({
      id: "coverage:current",
      kind: "coverage",
      value: JSON.stringify(input.evidence.coverage)
    });
  }
  for (const concept of plan.facts.targetConcepts) {
    entries.push({
      id: `mastery:${referenceComponent(concept)}`,
      kind: "mastery",
      value: String(masteryFor(input.learnerBefore, concept))
    });
  }
  for (const attempt of stableRecentHistory(input).slice(0, 5)) {
    entries.push({
      id: `history:${referenceComponent(attempt.fingerprint)}`,
      kind: "history",
      value: JSON.stringify({
        exerciseId: attempt.exerciseId,
        action: attempt.action,
        evidenceStatus: attempt.evidence.status,
        evidenceSummary: attempt.evidence.summary.slice(0, 300),
        createdAt: attempt.createdAt
      })
    });
  }
  if (input.courseContext) {
    entries.push({
      id: `course:${referenceComponent(input.courseContext.exerciseId ?? "current")}`,
      kind: "course",
      value: JSON.stringify(input.courseContext)
    });
  }
  return uniqueCatalog(entries);
}

function normaliseSelection(
  raw: RawConstrainedSelection | undefined,
  input: DecisionInput,
  plan: Extract<ConstrainedDecisionPlan, { status: "action" }>
): ConstrainedLlmNextStepSelection | undefined {
  if (!raw || !isAdaptiveAction(raw.action) || !plan.allowedActions.includes(raw.action)) return undefined;
  if (typeof raw.reason !== "string" || !raw.reason.trim()) return undefined;
  if (typeof raw.confidence !== "number" || !Number.isFinite(raw.confidence)) return undefined;
  const evidenceReferences = validateEvidenceReferences(raw.evidence_reference_ids, raw.action, input, plan);
  if (!evidenceReferences) return undefined;
  return {
    action: raw.action,
    reason: raw.reason.trim().replace(/\s+/g, " ").slice(0, 1000),
    evidenceReferences,
    confidence: Math.max(0, Math.min(1, raw.confidence))
  };
}

function validateEvidenceReferences(
  rawReferences: unknown,
  action: AdaptiveAction,
  input: DecisionInput,
  plan: Extract<ConstrainedDecisionPlan, { status: "action" }>
): string[] | undefined {
  if (!Array.isArray(rawReferences) || rawReferences.length < 1 || rawReferences.length > 6) return undefined;
  if (rawReferences.some((item) => typeof item !== "string" || item !== item.trim() || /[\r\n]/.test(item))) {
    return undefined;
  }
  const references = rawReferences as string[];
  if (new Set(references).size !== references.length) return undefined;
  const catalog = buildConstrainedDecisionEvidenceCatalog(input);
  const allowed = new Map(catalog.map((entry) => [entry.id, entry]));
  if (references.some((reference) => !allowed.has(reference))) return undefined;
  if (!references.includes("check:current")) return undefined;
  if ((action === "HARDER" || action === "NEXT_CONCEPT")
    && !references.some((reference) => allowed.get(reference)?.kind === "mastery")) return undefined;
  if (action === "NEXT_CONCEPT"
    && !references.some((reference) => allowed.get(reference)?.kind === "course")) return undefined;
  if (plan.facts.coverageScope === "narrow" && !references.includes("coverage:current")) return undefined;
  if (plan.facts.sameTaskPriorSupport && input.evidence.status === "failed"
    && !references.some((reference) => allowed.get(reference)?.kind === "history")) return undefined;
  return references;
}

function isAdaptiveAction(value: unknown): value is AdaptiveAction {
  return ["HINT", "RETRY_WITH_SCAFFOLD", "EASIER", "SIMILAR", "HARDER", "NEXT_CONCEPT"].includes(String(value));
}

function stableRecentHistory(input: DecisionInput): DecisionInput["history"] {
  return [...input.history].sort((left, right) => {
    const byTime = right.createdAt.localeCompare(left.createdAt);
    return byTime || left.fingerprint.localeCompare(right.fingerprint);
  });
}

function referenceComponent(value: string): string {
  return encodeURIComponent(value.trim()).replace(/%3A/gi, ":");
}

function uniqueCatalog(
  entries: ConstrainedDecisionEvidenceCatalogEntry[]
): ConstrainedDecisionEvidenceCatalogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function createDefaultLlmClient(): JsonCompleter {
  // Load the VS Code-dependent client lazily so ordinary Node unit tests can import this selector.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { AdaptiveLlmClient } = require("./llmClient") as typeof import("./llmClient");
  return new AdaptiveLlmClient();
}
