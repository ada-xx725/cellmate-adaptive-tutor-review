const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ADAPTIVE_ANALYSIS_VERSION,
  createAnalysisFingerprint
} = require("../out/adaptive/analysisFingerprint");

const input = {
  participantId: "student",
  notebookUri: "file:///lecture1.ipynb",
  cellIndex: 2,
  taskId: "exercise-1_2",
  code: "feet = metres / 0.3048",
  evidenceStatus: "passed",
  evidenceSummary: "SATISFIED: True",
  decisionVersion: "llm-next-step-v5",
  feedbackVersion: "adaptive-feedback-v3",
  supportVersion: "next-step-support-v1",
  presentationVersion: "student-presentation-v3"
};

test("analysis fingerprint is stable for the same complete analysis version", () => {
  assert.equal(ADAPTIVE_ANALYSIS_VERSION, "adaptive-analysis-v3");
  assert.equal(
    createAnalysisFingerprint(input),
    createAnalysisFingerprint({ ...input })
  );
});

test("decision, feedback, support, and presentation changes invalidate a saved result", () => {
  const original = createAnalysisFingerprint(input);
  assert.notEqual(
    original,
    createAnalysisFingerprint({ ...input, decisionVersion: "llm-next-step-v6" })
  );
  assert.notEqual(
    original,
    createAnalysisFingerprint({ ...input, feedbackVersion: "adaptive-feedback-v4" })
  );
  assert.notEqual(
    original,
    createAnalysisFingerprint({ ...input, supportVersion: "next-step-support-v2" })
  );
  assert.notEqual(
    original,
    createAnalysisFingerprint({ ...input, presentationVersion: "student-presentation-v4" })
  );
});
