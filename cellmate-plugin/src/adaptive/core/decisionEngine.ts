import { updateMastery, reasonsEvidenceIsInsufficient } from "../policy";
import { AdaptiveAction, AttemptRecord, DecisionReasonCode, LearnerState, TaskSpec, TestEvidence } from "../types";
import type { DecisionPolicy, PolicyName } from "./policies";

export interface CourseContext {
  exerciseId?: string;
  difficulty?: number;
  nextExercises?: string[];
  nextConcepts?: string[];
}

export interface DecisionInput {
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: AttemptRecord[];
  courseContext?: CourseContext;
}

interface DecisionResultBase {
  reasonCodes: DecisionReasonCode[];
  evidenceUsed: string[];
  learnerAfter: LearnerState;
  policy: PolicyName;
  policyVersion: string;
  selectionExplanation?: string;
  selectionConfidence?: number;
  selectionEvidenceReferences?: string[];
  fallbackUsed?: boolean;
  fallbackPolicyVersion?: string;
}

export type DecisionResult =
  | (DecisionResultBase & { status: "needs_evidence"; action?: never })
  | (DecisionResultBase & { status: "action"; action: AdaptiveAction });

export class DecisionEngine {
  constructor(private readonly policy: DecisionPolicy) {}

  decide(input: DecisionInput): DecisionResult {
    const learnerAfter = updateMastery(input.learnerBefore, input.taskSpec.targetConcepts, input.evidence);
    const base = {
      evidenceUsed: evidenceUsed(input.evidence),
      learnerAfter,
      policy: this.policy.name,
      policyVersion: this.policy.version
    };
    const evidenceReasons = reasonsEvidenceIsInsufficient(input.evidence);
    if (evidenceReasons.length) {
      return { ...base, status: "needs_evidence", reasonCodes: evidenceReasons };
    }
    const selected = this.policy.select(input);
    return { ...base, status: "action", action: selected.action, reasonCodes: selected.reasonCodes };
  }
}

function evidenceUsed(evidence: TestEvidence): string[] {
  return [
    `status:${evidence.status}`,
    `source:${evidence.source ?? "unknown"}`,
    `confidence:${evidence.confidence ?? "unknown"}`,
    `reliable:${evidence.hasReliableCheck !== false}`
  ];
}
