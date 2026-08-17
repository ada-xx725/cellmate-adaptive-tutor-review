import { TestEvidence } from "./types";
import type { CourseCheckSource } from "./courseNotebookLayout";

export function classifyCourseCheckOutput(
  output: string,
  source: CourseCheckSource = "pybryt",
  executionSuccess?: boolean
): TestEvidence {
  const trimmed = output.trim();
  const failed = /SATISFIED:\s*False/i.test(output)
    || /AssertionError|Traceback \(most recent call last\)|\bFAILED(?:\s|\[|:|$)|\bERRORS?\b|\d+\s+failed\b/i.test(output);
  if (executionSuccess === false || failed) {
    return {
      status: "failed",
      summary: trimmed ? output.slice(0, 1200) : `${checkLabel(source)} execution failed.`,
      source,
      confidence: "high",
      hasReliableCheck: true
    };
  }

  if (source === "assert" && executionSuccess === true) {
    return {
      status: "passed",
      summary: trimmed ? output.slice(0, 1200) : "The explicit assert check completed successfully.",
      source,
      confidence: "high",
      hasReliableCheck: true
    };
  }

  const explicitPass = source === "pybryt"
    ? /SATISFIED:\s*True/i.test(output) || /\bSUCCESS\s*:/i.test(output)
    : source === "pytest"
      ? /\b\d+\s+passed\b/i.test(output) || /Ran\s+\d+\s+tests?[\s\S]*\bOK\b/i.test(output)
      : false;
  if (explicitPass) {
    return {
      status: "passed",
      summary: output.slice(0, 1200),
      source,
      confidence: "high",
      hasReliableCheck: true
    };
  }

  if (!trimmed) {
    return {
      status: "not_run",
      summary: `Run the adjacent ${checkLabel(source)} check cell first.`,
      source,
      confidence: "high",
      hasReliableCheck: false
    };
  }
  return {
    status: "unavailable",
    summary: `Course check output was not recognised as an explicit pass or failure.\n${output.slice(0, 1100)}`,
    source,
    confidence: "low",
    hasReliableCheck: false
  };
}

function checkLabel(source: CourseCheckSource): string {
  if (source === "pybryt") return "PyBryt";
  if (source === "pytest") return "pytest/unittest";
  return "assert";
}
