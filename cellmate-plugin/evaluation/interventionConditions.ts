import { DecisionEngine, DecisionInput, DecisionResult } from "../src/adaptive/core/decisionEngine";
import { FixedPolicy, FullAdaptivePolicy } from "../src/adaptive/core/policies";

export type EvaluationCondition =
  | "feedback_only"
  | "fixed_next_step"
  | "rule_adaptive_next_step"
  | "llm_adaptive_next_step";

export interface Intervention {
  condition: EvaluationCondition;
  feedback: string;
  nextStep?: DecisionResult;
}

interface AsyncDecisionEngine {
  decide(input: DecisionInput): Promise<DecisionResult>;
}

const fixedEngine = new DecisionEngine(new FixedPolicy());
const ruleAdaptiveEngine = new DecisionEngine(new FullAdaptivePolicy());

export async function createIntervention(
  condition: EvaluationCondition,
  sharedFeedback: string,
  input: DecisionInput,
  llmEngine?: AsyncDecisionEngine
): Promise<Intervention> {
  if (condition === "feedback_only") {
    return { condition, feedback: sharedFeedback };
  }

  if (condition === "llm_adaptive_next_step") {
    if (!llmEngine) {
      throw new Error("llm_adaptive_next_step requires an injected versioned LLM decision engine.");
    }
    return {
      condition,
      feedback: sharedFeedback,
      nextStep: await llmEngine.decide(input)
    };
  }

  return {
    condition,
    feedback: sharedFeedback,
    nextStep: condition === "fixed_next_step"
      ? fixedEngine.decide(input)
      : ruleAdaptiveEngine.decide(input)
  };
}
