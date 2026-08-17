import { createHash } from "crypto";
import { AdaptiveAction, AttemptRecord, EvidenceSource, LearnerState, TaskSpec, TestEvidence } from "../types";
import { DecisionResult } from "./decisionEngine";

export interface DecisionHistoryEntry {
  fingerprint: string;
  exerciseId: string;
  action: AdaptiveAction;
  evidenceStatus: TestEvidence["status"];
  evidenceSource?: EvidenceSource;
  createdAt: string;
}

export interface DecisionTrace {
  schemaVersion: 3;
  traceId: string;
  stateId: string;
  participantId: string;
  policy: DecisionResult["policy"];
  policyVersion: string;
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: DecisionHistoryEntry[];
  status: DecisionResult["status"];
  action?: AdaptiveAction;
  reasonCodes: string[];
  evidenceUsed: string[];
  learnerAfter: LearnerState;
  latencyMs: number;
  modelVersion: string;
  promptVersion: string;
  policyUsesLlm: boolean;
  fallbackUsed?: boolean;
  selectionExplanation?: string;
  selectionConfidence?: number;
  selectionEvidenceReferences?: string[];
  selectorOutcome: "selected" | "rule_fallback" | "not_called" | "not_applicable";
  fallbackPolicyVersion?: string;
  createdAt: string;
}

export function createDecisionTrace(input: {
  stateId: string;
  participantId: string;
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: AttemptRecord[];
  decision: DecisionResult;
  latencyMs: number;
  modelVersion: string;
  promptVersion: string;
  createdAt?: string;
}): DecisionTrace {
  const createdAt = input.createdAt ?? new Date().toISOString();
  return {
    schemaVersion: 3,
    traceId: createTraceId(input),
    stateId: input.stateId,
    participantId: input.participantId,
    policy: input.decision.policy,
    policyVersion: input.decision.policyVersion,
    taskSpec: input.taskSpec,
    evidence: input.evidence,
    learnerBefore: input.learnerBefore,
    history: input.history.map(projectHistory),
    status: input.decision.status,
    action: input.decision.status === "action" ? input.decision.action : undefined,
    reasonCodes: input.decision.reasonCodes,
    evidenceUsed: input.decision.evidenceUsed,
    learnerAfter: input.decision.learnerAfter,
    latencyMs: input.latencyMs,
    modelVersion: input.modelVersion,
    promptVersion: input.promptVersion,
    policyUsesLlm: input.decision.policy === "llm_adaptive"
      && input.decision.status === "action"
      && input.decision.fallbackUsed !== true,
    fallbackUsed: input.decision.fallbackUsed,
    selectionExplanation: input.decision.selectionExplanation,
    selectionConfidence: input.decision.selectionConfidence,
    selectionEvidenceReferences: input.decision.selectionEvidenceReferences,
    selectorOutcome: selectorOutcome(input.decision),
    fallbackPolicyVersion: input.decision.fallbackPolicyVersion,
    createdAt
  };
}

function projectHistory(attempt: AttemptRecord): DecisionHistoryEntry {
  return {
    fingerprint: attempt.fingerprint,
    exerciseId: attempt.exerciseId,
    action: attempt.action,
    evidenceStatus: attempt.evidence.status,
    evidenceSource: attempt.evidence.source,
    createdAt: attempt.createdAt
  };
}

function selectorOutcome(decision: DecisionResult): DecisionTrace["selectorOutcome"] {
  if (decision.policy !== "llm_adaptive") return "not_applicable";
  if (decision.status === "needs_evidence") return "not_called";
  return decision.fallbackUsed ? "rule_fallback" : "selected";
}

function createTraceId(input: Pick<Parameters<typeof createDecisionTrace>[0], "participantId" | "stateId" | "decision">): string {
  const boundary = [
    input.participantId,
    input.stateId,
    input.decision.policy,
    input.decision.policyVersion,
    input.decision.status,
    input.decision.status === "action" ? input.decision.action : "needs_evidence"
  ].join("|");
  return `trace:${createHash("sha256").update(boundary).digest("hex").slice(0, 24)}`;
}
