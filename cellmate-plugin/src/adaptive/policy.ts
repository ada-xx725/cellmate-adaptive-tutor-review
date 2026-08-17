import { AdaptiveDecision, DecisionReasonCode, LearnerState, TestEvidence } from "./types";
import { canonicalConcepts, masteryFor, normaliseLearnerState } from "./concepts";

export function decideAdaptiveAction(input: {
  evidence: TestEvidence;
  attempts: number;
  learner: LearnerState;
  concepts: string[];
  conceptSuccessStreak?: number;
  recentConceptFailures?: number;
}): AdaptiveDecision {
  const evidenceReasons = reasonsEvidenceIsInsufficient(input.evidence);
  if (evidenceReasons.length) return { status: "needs_evidence", reasonCodes: evidenceReasons };
  if (input.evidence.status === "failed") {
    const repeatedFailure = input.attempts >= 2 || (input.recentConceptFailures ?? 0) >= 1;
    return {
      status: "action",
      action: repeatedFailure ? "EASIER" : "RETRY_WITH_SCAFFOLD",
      reasonCodes: [repeatedFailure ? "REPEATED_TASK_OR_CONCEPT_FAILURE" : "FIRST_RELIABLE_FAILURE"]
    };
  }
  const concepts = canonicalConcepts(input.concepts);
  const average = concepts.length
    ? concepts.reduce((total, concept) => total + masteryFor(input.learner, concept), 0) / concepts.length
    : 50;
  const successStreak = input.conceptSuccessStreak ?? 0;
  if (successStreak >= 2) {
    return { status: "action", action: "NEXT_CONCEPT", reasonCodes: ["SUCCESS_STREAK_AT_LEAST_2"] };
  }
  if (successStreak >= 1 && input.evidence.confidence === "high") {
    return {
      status: "action",
      action: average >= 75 ? "NEXT_CONCEPT" : "HARDER",
      reasonCodes: [average >= 75 ? "SUCCESS_STREAK_WITH_SOLID_MASTERY" : "SUCCESS_STREAK_WITH_HIGH_CONFIDENCE"]
    };
  }
  if (average >= 85) {
    return { status: "action", action: "NEXT_CONCEPT", reasonCodes: ["MASTERY_AT_LEAST_85"] };
  }
  if (average >= 70) {
    return { status: "action", action: "HARDER", reasonCodes: ["MASTERY_AT_LEAST_70"] };
  }
  return { status: "action", action: "SIMILAR", reasonCodes: ["MASTERY_BELOW_70"] };
}

export function reasonsEvidenceIsInsufficient(evidence: TestEvidence): DecisionReasonCode[] {
  const reasons: DecisionReasonCode[] = [];
  if (evidence.status === "not_run") reasons.push("CHECK_NOT_RUN");
  if (evidence.status === "unavailable") reasons.push("EVIDENCE_UNAVAILABLE");
  if (evidence.confidence === "low") reasons.push("LOW_CONFIDENCE_EVIDENCE");
  return reasons;
}

export function updateMastery(state: LearnerState, concepts: string[], evidence: TestEvidence): LearnerState {
  const normalised = normaliseLearnerState(state);
  if (evidence.hasReliableCheck === false || evidence.status === "not_run" || evidence.status === "unavailable") {
    return normalised;
  }
  const delta = evidence.status === "passed" ? 8 : evidence.status === "failed" ? -6 : 0;
  const mastery = { ...normalised.mastery };
  for (const concept of canonicalConcepts(concepts)) {
    mastery[concept] = Math.max(0, Math.min(100, masteryFor(normalised, concept) + delta));
  }
  return { ...normalised, mastery };
}
