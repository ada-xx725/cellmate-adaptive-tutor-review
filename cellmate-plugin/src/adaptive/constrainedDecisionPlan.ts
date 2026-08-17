import { canonicalConcepts, masteryFor } from "./concepts";
import { reasonsEvidenceIsInsufficient } from "./policy";
import { AdaptiveAction, AttemptRecord, DecisionReasonCode } from "./types";
import { DecisionInput } from "./core/decisionEngine";

export interface ConstrainedDecisionFacts {
  evidenceStatus: DecisionInput["evidence"]["status"];
  coverageScope: "narrow" | "broad" | "unknown";
  targetConcepts: string[];
  averageMastery: number;
  sameTaskPriorSupport?: AdaptiveAction;
  stableSuccessStreak: number;
  hasCourseTarget: boolean;
}

export type ConstrainedDecisionPlan =
  | {
    status: "needs_evidence";
    allowedActions: [];
    reasonCodes: DecisionReasonCode[];
    facts: ConstrainedDecisionFacts;
  }
  | {
    status: "action";
    allowedActions: AdaptiveAction[];
    defaultAction: AdaptiveAction;
    reasonCodes: DecisionReasonCode[];
    facts: ConstrainedDecisionFacts;
  };

export function buildConstrainedDecisionPlan(input: DecisionInput): ConstrainedDecisionPlan {
  const facts = buildConstrainedDecisionFacts(input);
  const evidenceReasons = reasonsEvidenceIsInsufficient(input.evidence);
  if (evidenceReasons.length) {
    return {
      status: "needs_evidence",
      allowedActions: [],
      reasonCodes: evidenceReasons,
      facts
    };
  }

  if (input.evidence.status === "failed") {
    if (facts.sameTaskPriorSupport === "HINT") {
      return actionPlan(["RETRY_WITH_SCAFFOLD"], "RETRY_WITH_SCAFFOLD", "V7_HINT_FAILED", facts);
    }
    if (facts.sameTaskPriorSupport === "RETRY_WITH_SCAFFOLD") {
      return actionPlan(["EASIER"], "EASIER", "V7_SCAFFOLD_FAILED", facts);
    }
    return actionPlan(
      ["HINT", "RETRY_WITH_SCAFFOLD"],
      "RETRY_WITH_SCAFFOLD",
      "V7_FIRST_RELIABLE_FAILURE",
      facts
    );
  }

  if (facts.coverageScope === "narrow") {
    return actionPlan(["SIMILAR"], "SIMILAR", "V7_NARROW_COVERAGE", facts);
  }
  if (facts.averageMastery < 70) {
    return actionPlan(["SIMILAR"], "SIMILAR", "V7_MASTERY_BELOW_70", facts);
  }
  if (facts.averageMastery < 85) {
    return actionPlan(["SIMILAR", "HARDER"], "HARDER", "V7_MASTERY_70_TO_84", facts);
  }
  if (facts.stableSuccessStreak >= 2 && facts.hasCourseTarget) {
    return actionPlan(
      ["NEXT_CONCEPT"],
      "NEXT_CONCEPT",
      "V7_STABLE_SUCCESS_WITH_COURSE_TARGET",
      facts
    );
  }
  if (!facts.hasCourseTarget) {
    return actionPlan(
      ["HARDER"],
      "HARDER",
      "V7_HIGH_MASTERY_WITHOUT_COURSE_TARGET",
      facts
    );
  }
  return actionPlan(
    ["HARDER"],
    "HARDER",
    "V7_HIGH_MASTERY_WITHOUT_STABLE_SUCCESS",
    facts
  );
}

export function buildConstrainedDecisionFacts(input: DecisionInput): ConstrainedDecisionFacts {
  const targetConcepts = canonicalConcepts(input.taskSpec.targetConcepts).sort();
  const scores = targetConcepts.map((concept) => masteryFor(input.learnerBefore, concept));
  const averageMastery = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);
  const history = stableRecentHistory(input.history);
  const sameTaskPrior = history.find((attempt) => attempt.exerciseId === input.taskSpec.id);
  return {
    evidenceStatus: input.evidence.status,
    coverageScope: coverageScope(input),
    targetConcepts,
    averageMastery,
    sameTaskPriorSupport: sameTaskPrior?.evidence.status === "failed" ? sameTaskPrior.action : undefined,
    stableSuccessStreak: successStreak(history, input),
    hasCourseTarget: Boolean(input.courseContext?.nextConcepts?.some((concept) => concept.trim()))
  };
}

function actionPlan(
  allowedActions: AdaptiveAction[],
  defaultAction: AdaptiveAction,
  reasonCode: DecisionReasonCode,
  facts: ConstrainedDecisionFacts
): ConstrainedDecisionPlan {
  if (!allowedActions.includes(defaultAction)) {
    throw new Error("The constrained default action must be included in the allowed action set.");
  }
  return {
    status: "action",
    allowedActions,
    defaultAction,
    reasonCodes: [reasonCode],
    facts
  };
}

function coverageScope(input: DecisionInput): ConstrainedDecisionFacts["coverageScope"] {
  const coverage = input.evidence.coverage;
  if (!coverage) return "unknown";
  if (coverage.scope === "narrow" || (coverage.notCovered?.length ?? 0) > 0) return "narrow";
  return coverage.scope;
}

function stableRecentHistory(history: AttemptRecord[]): AttemptRecord[] {
  return [...history].sort((left, right) => {
    const byTime = right.createdAt.localeCompare(left.createdAt);
    return byTime || left.fingerprint.localeCompare(right.fingerprint);
  });
}

function successStreak(history: AttemptRecord[], input: DecisionInput): number {
  const relevant = history.filter((attempt) => isRelevantAttempt(attempt, input));
  let streak = 0;
  for (const attempt of relevant) {
    if (attempt.evidence.status !== "passed" || attempt.evidence.hasReliableCheck === false) break;
    streak += 1;
  }
  return streak;
}

function isRelevantAttempt(attempt: AttemptRecord, input: DecisionInput): boolean {
  if (attempt.exerciseId === input.taskSpec.id) return true;
  const attemptConcepts = canonicalConcepts(attempt.taskSpec?.targetConcepts, []);
  if (!attemptConcepts.length) return false;
  const current = new Set(canonicalConcepts(input.taskSpec.targetConcepts));
  return attemptConcepts.some((concept) => current.has(concept));
}
