export type AdaptiveAction =
  | "HINT"
  | "RETRY_WITH_SCAFFOLD"
  | "EASIER"
  | "SIMILAR"
  | "HARDER"
  | "NEXT_CONCEPT";

export type SourceMode = "generated_attempt" | "course_verified" | "generic_llm" | "self_study_goal";
export type EvidenceSource = "pybryt" | "assert" | "pytest" | "cell_output" | "runtime_error" | "llm_generated_tests" | "none";
export type EvidenceConfidence = "high" | "medium" | "low";
export type DecisionReasonCode =
  | "CHECK_NOT_RUN"
  | "EVIDENCE_UNAVAILABLE"
  | "LOW_CONFIDENCE_EVIDENCE"
  | "FIRST_RELIABLE_FAILURE"
  | "REPEATED_TASK_OR_CONCEPT_FAILURE"
  | "SUCCESS_STREAK_AT_LEAST_2"
  | "SUCCESS_STREAK_WITH_SOLID_MASTERY"
  | "SUCCESS_STREAK_WITH_HIGH_CONFIDENCE"
  | "MASTERY_AT_LEAST_85"
  | "MASTERY_AT_LEAST_70"
  | "MASTERY_BELOW_70"
  | "FIXED_FAIL_RETRY"
  | "FIXED_PASS_SIMILAR"
  | "CURRENT_TASK_HIGH_DIFFICULTY_FAILURE"
  | "CURRENT_TASK_FAILURE"
  | "COURSE_NEXT_CONCEPT_AVAILABLE"
  | "CURRENT_TASK_DIFFICULTY_AT_LEAST_2"
  | "CURRENT_TASK_PASS"
  | "LLM_SELECTED"
  | "LLM_INVALID_FALLBACK"
  | "V7_FIRST_RELIABLE_FAILURE"
  | "V7_HINT_FAILED"
  | "V7_SCAFFOLD_FAILED"
  | "V7_NARROW_COVERAGE"
  | "V7_MASTERY_BELOW_70"
  | "V7_MASTERY_70_TO_84"
  | "V7_STABLE_SUCCESS_WITH_COURSE_TARGET"
  | "V7_HIGH_MASTERY_WITHOUT_COURSE_TARGET"
  | "V7_HIGH_MASTERY_WITHOUT_STABLE_SUCCESS";

export type AdaptiveDecision =
  | { status: "needs_evidence"; reasonCodes: DecisionReasonCode[] }
  | { status: "action"; action: AdaptiveAction; reasonCodes: DecisionReasonCode[] };

export interface CourseExercise {
  id: string;
  origin: "course" | "generic" | "generated";
  lecture?: number;
  exercise?: number;
  title: string;
  promptMarkdown: string;
  targetConcepts: string[];
  primaryConcept?: string;
  difficulty?: number;
  nextExercises?: string[];
  nextConcepts?: string[];
  notebook?: string;
  parentId?: string;
}

export interface NotebookContext {
  notebookUri: string;
  cellIndex: number;
  currentCode: string;
  currentOutput: string;
  currentExecutionSuccess?: boolean;
  beforeMarkdown: string[];
  afterMarkdown: string[];
  nearbyCode: string[];
  nearbyOutputs: string[];
  nearbyCodeCells: NotebookCodeContext[];
}

export interface NotebookCodeContext {
  cellIndex: number;
  code: string;
  output: string;
  executionSuccess?: boolean;
}

export interface TaskSpec {
  id: string;
  sourceMode: SourceMode;
  taskSummary: string;
  expectedBehavior: string;
  title: string;
  promptMarkdown: string;
  targetConcepts: string[];
  primaryConcept: string;
  difficulty: number;
  confidence: number;
  exercise?: CourseExercise;
  generatedTests?: string;
  expectedFunction?: string;
  learningGoal?: string;
}

export interface CourseRecommendation {
  exerciseId: string;
  title: string;
  notebook?: string;
  reason: string;
  source: "next_exercises" | "same_concept" | "next_concept";
  generatedFallbackNeeded: boolean;
}

export interface NextStepDecisionPresentation {
  source: "llm" | "rule_backup" | "rule_policy";
  model?: string;
  promptVersion: string;
  reason?: string;
  confidence?: number;
  evidenceReferences?: string[];
}

export interface NextStepSupport {
  action: "HINT" | "RETRY_WITH_SCAFFOLD";
  source: "llm" | "local_fallback";
  promptVersion: string;
  instruction: string;
  hint?: string;
  steps?: string[];
  scaffoldCode?: string;
}

export interface LearnerState {
  studentId: string;
  mastery: Record<string, number>;
}

export interface TestEvidence {
  status: "passed" | "failed" | "not_run" | "unavailable";
  summary: string;
  source?: EvidenceSource;
  confidence?: EvidenceConfidence;
  hasReliableCheck?: boolean;
  coverage?: {
    scope: "narrow" | "broad" | "unknown";
    passedChecks?: number;
    totalChecks?: number;
    categories?: string[];
    notCovered?: string[];
  };
}

export interface GeneratedExercise extends CourseExercise {
  origin: "generated";
  parentId: string;
  action: AdaptiveAction;
  starterCode: string;
  referenceSolution: string;
  negativeCandidate?: string;
  testCode: string;
  model: string;
  promptVersion: string;
  createdAt: string;
  validated: boolean;
  fallbackUsed?: boolean;
  validationStatus?: "accepted" | "repaired" | "fallback" | "failed";
  originMode?: SourceMode;
  learningGoal?: string;
  taskSpec?: TaskSpec;
}

export interface AttemptRecord {
  participantId: string;
  fingerprint: string;
  exerciseId: string;
  action: AdaptiveAction;
  evidence: TestEvidence;
  feedback?: LlmFeedback;
  support?: NextStepSupport;
  taskSpec?: TaskSpec;
  courseRecommendation?: CourseRecommendation;
  generatedId?: string;
  decisionPresentation?: NextStepDecisionPresentation;
  learnerBefore?: LearnerState;
  learnerAfter?: LearnerState;
  createdAt: string;
}

export interface GeneratedCandidate {
  title: string;
  promptMarkdown: string;
  targetConcepts: string[];
  primaryConcept?: string;
  difficulty?: number;
  starterCode: string;
  referenceSolution: string;
  negativeCandidate?: string;
  testCode: string;
  model: string;
}

export interface ValidationResult {
  ok: boolean;
  referencePassed: boolean;
  starterFailed: boolean;
  negativeFailed?: boolean;
  importsAllowed: boolean;
  functionNamesMatch: boolean;
  summary: string;
}

export interface LlmFeedback {
  diagnosis: string;
  affectedConcepts: string[];
  explanation: string;
  confidence: number;
}
