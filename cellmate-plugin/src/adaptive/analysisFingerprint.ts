import { createHash } from "crypto";

export const ADAPTIVE_ANALYSIS_VERSION = "adaptive-analysis-v3";

export interface AnalysisFingerprintInput {
  participantId: string;
  notebookUri: string;
  cellIndex: number;
  taskId: string;
  code: string;
  evidenceStatus: string;
  evidenceSummary: string;
  decisionVersion: string;
  feedbackVersion: string;
  supportVersion: string;
  presentationVersion: string;
}

export function createAnalysisFingerprint(input: AnalysisFingerprintInput): string {
  return createHash("sha256")
    .update(JSON.stringify({
      analysisVersion: ADAPTIVE_ANALYSIS_VERSION,
      ...input
    }))
    .digest("hex");
}
