import { AdaptiveAction, LearnerState, LlmFeedback, TaskSpec, TestEvidence } from "./types";
import { AdaptiveLlmClient } from "./llmClient";
import { canonicalConcepts } from "./concepts";
import { buildFeedbackPrompt, fallbackFeedback, FEEDBACK_PROMPT_VERSION } from "./feedbackGuidance";

export { FEEDBACK_PROMPT_VERSION } from "./feedbackGuidance";

export class FeedbackAgent {
  constructor(private readonly llm = new AdaptiveLlmClient()) {}

  async generate(input: {
    taskSpec: TaskSpec;
    evidence: TestEvidence;
    learner: LearnerState;
    action: AdaptiveAction;
    studentCode: string;
  }): Promise<LlmFeedback> {
    const generated = await this.llm.completeJson<LlmFeedback>({
      system: "You are an educational Python feedback agent. Ground every claim in the supplied evidence or code, use plain language, return valid JSON only, and never provide a full solution.",
      prompt: buildFeedbackPrompt(input)
    });
    return isFeedback(generated, input.evidence)
      ? { ...generated, affectedConcepts: canonicalConcepts(generated.affectedConcepts, input.taskSpec.targetConcepts) }
      : fallbackFeedback(input.taskSpec, input.evidence, input.action);
  }
}

function isFeedback(value: LlmFeedback | undefined, evidence: TestEvidence): value is LlmFeedback {
  if (!value || typeof value.diagnosis !== "string" || !Array.isArray(value.affectedConcepts) || typeof value.explanation !== "string") {
    return false;
  }
  if (evidence.status === "failed" && /```|(^|\n)\s*(def|return|import|from)\b|\b[A-Za-z_]\w*\s*=/.test(value.explanation)) {
    return false;
  }
  return true;
}
