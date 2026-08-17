import { buildConstrainedDecisionPlan } from "../constrainedDecisionPlan";
import {
  ConstrainedLlmNextStepSelection,
  LLM_NEXT_STEP_PROMPT_VERSION_V7,
  LlmNextStepSelectorV7
} from "../llmNextStepSelectorV7";
import { updateMastery } from "../policy";
import { AdaptiveAction } from "../types";
import { DecisionInput, DecisionResult } from "./decisionEngine";

interface ConstrainedNextStepSelector {
  select(input: DecisionInput): Promise<ConstrainedLlmNextStepSelection | undefined>;
}

export class ConstrainedLlmDecisionEngine {
  constructor(private readonly selector: ConstrainedNextStepSelector = new LlmNextStepSelectorV7()) {}

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const plan = buildConstrainedDecisionPlan(input);
    const learnerAfter = updateMastery(input.learnerBefore, input.taskSpec.targetConcepts, input.evidence);
    const base = {
      evidenceUsed: evidenceUsed(input),
      learnerAfter,
      policy: "llm_adaptive" as const,
      policyVersion: LLM_NEXT_STEP_PROMPT_VERSION_V7
    };
    if (plan.status === "needs_evidence") {
      return {
        ...base,
        status: "needs_evidence",
        reasonCodes: plan.reasonCodes,
        fallbackUsed: false
      };
    }

    const selected = await this.selector.select(input);
    if (!selected || !plan.allowedActions.includes(selected.action)) {
      return {
        ...base,
        status: "action",
        action: plan.defaultAction,
        reasonCodes: ["LLM_INVALID_FALLBACK", ...plan.reasonCodes],
        fallbackUsed: true,
        fallbackPolicyVersion: "constrained-plan-v1"
      };
    }
    return {
      ...base,
      status: "action",
      action: selected.action,
      reasonCodes: ["LLM_SELECTED", ...plan.reasonCodes],
      selectionExplanation: selected.reason,
      selectionConfidence: selected.confidence,
      selectionEvidenceReferences: selected.evidenceReferences,
      fallbackUsed: false
    };
  }
}

function evidenceUsed(input: DecisionInput): string[] {
  const evidence = input.evidence;
  const used = [
    `status:${evidence.status}`,
    `source:${evidence.source ?? "unknown"}`,
    `confidence:${evidence.confidence ?? "unknown"}`,
    `reliable:${evidence.hasReliableCheck !== false}`
  ];
  if (evidence.coverage) used.push(`coverage:${evidence.coverage.scope}`);
  return used;
}

export function actionIsAllowedByV7(input: DecisionInput, action: AdaptiveAction): boolean {
  const plan = buildConstrainedDecisionPlan(input);
  return plan.status === "action" && plan.allowedActions.includes(action);
}
