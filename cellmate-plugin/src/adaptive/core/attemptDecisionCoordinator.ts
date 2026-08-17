import type { AttemptRecord, LearnerState } from "../types";
import type { DecisionInput, DecisionResult } from "./decisionEngine";

type DecisionContext = Omit<DecisionInput, "learnerBefore" | "history">;

export interface AttemptDecisionStore {
  getAttempt(fingerprint: string): Promise<AttemptRecord | undefined>;
  getLearner(participantId: string): Promise<LearnerState>;
  attemptHistory(participantId: string): Promise<AttemptRecord[]>;
}

export interface AsyncDecisionEngine {
  decide(input: DecisionInput): Promise<DecisionResult>;
}

export type AttemptDecisionResolution =
  | {
    kind: "saved_attempt";
    attempt: AttemptRecord;
  }
  | {
    kind: "new_decision";
    learnerBefore: LearnerState;
    history: AttemptRecord[];
    decision: DecisionResult;
    latencyMs: number;
  };

export async function resolveAttemptDecision(
  input: DecisionContext & { attemptFingerprint: string; participantId: string },
  store: AttemptDecisionStore,
  engine: AsyncDecisionEngine,
  now: () => number = Date.now
): Promise<AttemptDecisionResolution> {
  const savedAttempt = await store.getAttempt(input.attemptFingerprint);
  if (savedAttempt) {
    return { kind: "saved_attempt", attempt: savedAttempt };
  }

  const learnerBefore = await store.getLearner(input.participantId);
  const history = await store.attemptHistory(input.participantId);
  const decisionStartedAt = now();
  const decision = await engine.decide({
    taskSpec: input.taskSpec,
    evidence: input.evidence,
    learnerBefore,
    history,
    courseContext: input.courseContext
  });

  return {
    kind: "new_decision",
    learnerBefore,
    history,
    decision,
    latencyMs: Math.max(0, now() - decisionStartedAt)
  };
}
