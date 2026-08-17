import { LLM_NEXT_STEP_PROMPT_VERSION, LlmNextStepSelection, LlmNextStepSelector } from "../llmNextStepSelector";
import { DecisionEngine, DecisionInput, DecisionResult } from "./decisionEngine";
import { FullAdaptivePolicy } from "./policies";

interface NextStepSelector {
  select(input: DecisionInput): Promise<LlmNextStepSelection | undefined>;
}

export class LlmDecisionEngine {
  constructor(
    private readonly selector: NextStepSelector = new LlmNextStepSelector(),
    private readonly fallback = new DecisionEngine(new FullAdaptivePolicy())
  ) {}

  async decide(input: DecisionInput): Promise<DecisionResult> {
    const fallbackDecision = this.fallback.decide(input);
    if (fallbackDecision.status === "needs_evidence") {
      return {
        ...fallbackDecision,
        policy: "llm_adaptive",
        policyVersion: LLM_NEXT_STEP_PROMPT_VERSION,
        fallbackUsed: false
      };
    }

    const selected = await this.selector.select(input);
    if (!selected) {
      return {
        ...fallbackDecision,
        policy: "llm_adaptive",
        policyVersion: LLM_NEXT_STEP_PROMPT_VERSION,
        reasonCodes: ["LLM_INVALID_FALLBACK", ...fallbackDecision.reasonCodes],
        fallbackUsed: true,
        fallbackPolicyVersion: fallbackDecision.policyVersion
      };
    }

    return {
      ...fallbackDecision,
      policy: "llm_adaptive",
      policyVersion: LLM_NEXT_STEP_PROMPT_VERSION,
      action: selected.action,
      reasonCodes: ["LLM_SELECTED"],
      selectionExplanation: selected.reason,
      selectionConfidence: selected.confidence,
      selectionEvidenceReferences: selected.evidenceReferences,
      fallbackUsed: false
    };
  }
}
