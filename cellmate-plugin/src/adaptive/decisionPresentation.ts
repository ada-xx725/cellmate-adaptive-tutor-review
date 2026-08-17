import { DecisionResult } from "./core/decisionEngine";
import {
  AdaptiveAction,
  EvidenceConfidence,
  NextStepDecisionPresentation,
  SourceMode,
  TestEvidence
} from "./types";

export function createDecisionPresentation(
  decision: DecisionResult,
  configuredModel?: string
): NextStepDecisionPresentation | undefined {
  if (decision.status !== "action") return undefined;

  if (decision.policy === "llm_adaptive" && decision.fallbackUsed) {
    return {
      source: "rule_backup",
      model: configuredModel || undefined,
      promptVersion: decision.policyVersion,
      reason:
        "The configured LLM did not return a valid, evidence-consistent action, so the saved rule policy selected this backup action."
    };
  }

  if (decision.policy === "llm_adaptive") {
    return {
      source: "llm",
      model: configuredModel || undefined,
      promptVersion: decision.policyVersion,
      reason: decision.selectionExplanation,
      confidence: decision.selectionConfidence,
      evidenceReferences: decision.selectionEvidenceReferences
    };
  }

  return {
    source: "rule_policy",
    promptVersion: decision.policyVersion,
    reason: "This action was selected by the configured deterministic policy."
  };
}

export function decisionPresentationMarkdown(
  presentation: NextStepDecisionPresentation | undefined
): string {
  if (!presentation) return "";

  const source =
    presentation.source === "llm"
      ? `LLM${presentation.model ? ` (${presentation.model})` : ""}`
      : presentation.source === "rule_backup"
        ? "rule-based backup"
        : "rule-based policy";
  const lines = [
    "### Decision Source",
    `Selected by: **${source}**`,
    `Decision prompt/policy version: \`${presentation.promptVersion}\``
  ];

  if (presentation.reason) {
    lines.push("", `Why this action: ${presentation.reason}`);
  }
  if (typeof presentation.confidence === "number") {
    lines.push("", `Selection confidence: ${Math.round(presentation.confidence * 100)}%`);
  }
  if (presentation.evidenceReferences?.length) {
    lines.push(
      "",
      "Evidence referenced by the selector:",
      ...presentation.evidenceReferences.map((reference) => `- \`${safeInlineCode(reference)}\``)
    );
  }

  return lines.join("\n");
}

function safeInlineCode(value: string): string {
  return value.replace(/[\r\n`]/g, "");
}

export function actionExplanation(action: AdaptiveAction, hasCourseRecommendation: boolean): string {
  const messages: Record<AdaptiveAction, string> = {
    HINT: "Use one small clue, then try the current exercise again.",
    RETRY_WITH_SCAFFOLD: "Try the current exercise again with the work split into smaller steps.",
    EASIER: "Build the missing skill with a shorter, simpler exercise first.",
    SIMILAR: hasCourseRecommendation
      ? "Practise the same skills in the next related course exercise."
      : "Practise the same idea in a closely related exercise.",
    HARDER: hasCourseRecommendation
      ? "Continue with a more challenging related course exercise."
      : "Use the same skill in a task with one extra challenge.",
    NEXT_CONCEPT: hasCourseRecommendation
      ? "Continue to the next topic in the course."
      : "You are ready to start the next topic."
  };
  return messages[action];
}

export function actionStudentLabel(action: AdaptiveAction): string {
  const labels: Record<AdaptiveAction, string> = {
    HINT: "Get a small hint",
    RETRY_WITH_SCAFFOLD: "Try again with step-by-step support",
    EASIER: "Start with a simpler exercise",
    SIMILAR: "Practise a similar exercise",
    HARDER: "Try a harder exercise",
    NEXT_CONCEPT: "Move to the next topic"
  };
  return labels[action];
}

export function masteryBand(score: number): string {
  if (score < 55) return "starting";
  if (score < 70) return "developing";
  if (score < 85) return "making good progress";
  return "strong";
}

export function sourceModeLabel(mode: SourceMode): string {
  const labels: Record<SourceMode, string> = {
    course_verified: "Course exercise",
    generated_attempt: "Generated practice exercise",
    generic_llm: "Notebook exercise",
    self_study_goal: "Self-study goal"
  };
  return labels[mode];
}

export function confidenceLabel(confidence: EvidenceConfidence | undefined): string {
  if (confidence === "high") return "high";
  if (confidence === "medium") return "medium";
  return "low";
}

export function evidenceStudentOutcome(evidence: TestEvidence): {
  heading: string;
  message: string;
} {
  if (evidence.status === "passed") {
    return {
      heading: "Check passed",
      message: "Your latest exercise check passed."
    };
  }
  if (evidence.status === "failed") {
    return {
      heading: "The check found something to fix",
      message: "Your work is not complete yet. Use the feedback below, then try again."
    };
  }
  if (evidence.status === "not_run") {
    return {
      heading: "Run the exercise check first",
      message: "I need a check result before I can recommend a useful next step."
    };
  }
  return {
    heading: "The check result is unclear",
    message: "I could not confirm whether this exercise passed. Run or fix the check, then try again."
  };
}

export function displayConceptName(concept: string): string {
  return concept
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function courseExerciseDisplayId(exerciseId: string): string {
  const match = exerciseId.match(/^exercise-(\d+)_(\d+)$/i);
  return match ? `Exercise ${match[1]}.${match[2]}` : exerciseId;
}
