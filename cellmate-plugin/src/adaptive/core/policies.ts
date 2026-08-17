import { canonicalConceptId, canonicalConcepts } from "../concepts";
import { decideAdaptiveAction } from "../policy";
import { AdaptiveAction, DecisionReasonCode } from "../types";
import type { DecisionInput } from "./decisionEngine";

export type PolicyName = "fixed" | "no_history" | "full_adaptive" | "llm_adaptive";

export interface PolicySelection {
  action: AdaptiveAction;
  reasonCodes: DecisionReasonCode[];
}

export interface DecisionPolicy {
  readonly name: PolicyName;
  readonly version: string;
  select(input: DecisionInput): PolicySelection;
}

export class FixedPolicy implements DecisionPolicy {
  readonly name = "fixed" as const;
  readonly version = "fixed-v2";

  select(input: DecisionInput): PolicySelection {
    return input.evidence.status === "failed"
      ? { action: "RETRY_WITH_SCAFFOLD", reasonCodes: ["FIXED_FAIL_RETRY"] }
      : { action: "SIMILAR", reasonCodes: ["FIXED_PASS_SIMILAR"] };
  }
}

export class NoHistoryPolicy implements DecisionPolicy {
  readonly name = "no_history" as const;
  readonly version = "no-history-v1";

  select(input: DecisionInput): PolicySelection {
    const difficulty = input.courseContext?.difficulty ?? input.taskSpec.difficulty;
    if (input.evidence.status === "failed") {
      return difficulty >= 3
        ? { action: "EASIER", reasonCodes: ["CURRENT_TASK_HIGH_DIFFICULTY_FAILURE"] }
        : { action: "RETRY_WITH_SCAFFOLD", reasonCodes: ["CURRENT_TASK_FAILURE"] };
    }
    if ((input.courseContext?.nextConcepts?.length ?? 0) > 0 && (input.courseContext?.nextExercises?.length ?? 0) === 0) {
      return { action: "NEXT_CONCEPT", reasonCodes: ["COURSE_NEXT_CONCEPT_AVAILABLE"] };
    }
    if (difficulty >= 2) {
      return { action: "HARDER", reasonCodes: ["CURRENT_TASK_DIFFICULTY_AT_LEAST_2"] };
    }
    return { action: "SIMILAR", reasonCodes: ["CURRENT_TASK_PASS"] };
  }
}

export class FullAdaptivePolicy implements DecisionPolicy {
  readonly name = "full_adaptive" as const;
  readonly version = "full-adaptive-v1";

  select(input: DecisionInput): PolicySelection {
    const primaryConcept = canonicalConceptId(input.taskSpec.primaryConcept);
    const relevant = input.history
      .filter((attempt) => canonicalConcepts(attempt.taskSpec?.targetConcepts).includes(primaryConcept))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const decision = decideAdaptiveAction({
      evidence: input.evidence,
      attempts: input.history.filter((attempt) => attempt.exerciseId === input.taskSpec.id).length,
      learner: input.learnerBefore,
      concepts: input.taskSpec.targetConcepts,
      conceptSuccessStreak: successStreak(relevant),
      recentConceptFailures: relevant.slice(0, 3).filter((attempt) => attempt.evidence.status === "failed" && attempt.evidence.hasReliableCheck !== false).length
    });
    if (decision.status !== "action") throw new Error("DecisionEngine must gate insufficient evidence before invoking a policy.");
    return { action: decision.action, reasonCodes: decision.reasonCodes };
  }
}

function successStreak(attempts: DecisionInput["history"]): number {
  let streak = 0;
  for (const attempt of attempts) {
    if (attempt.evidence.status === "passed" && attempt.evidence.hasReliableCheck !== false) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}
