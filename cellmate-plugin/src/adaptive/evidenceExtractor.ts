import { NotebookContext, TaskSpec, TestEvidence } from "./types";
import { PythonValidator } from "./pythonValidator";
import { classifyCourseCheckOutput } from "./courseCheckParser";

export class EvidenceExtractor {
  constructor(private readonly validator: PythonValidator) {}

  async collectGenericEvidence(input: {
    context: NotebookContext;
    taskSpec: TaskSpec;
    pythonPath: string;
  }): Promise<TestEvidence> {
    const outputEvidence = evidenceFromRuntimeOutput(input.context.currentOutput, input.context.currentExecutionSuccess);
    if (outputEvidence.status === "failed") return outputEvidence;

    const associatedCheck = findAssociatedCheckCell(input.context);
    if (associatedCheck) {
      if (associatedCheck.source === "pytest") {
        return classifyCourseCheckOutput(associatedCheck.cell.output, "pytest", associatedCheck.cell.executionSuccess);
      }
      const result = await this.validator.run(input.context.currentCode, associatedCheck.cell.code, input.pythonPath);
      return {
        ...result,
        source: "assert",
        confidence: "high",
        hasReliableCheck: result.status === "passed" || result.status === "failed"
      };
    }

    if (input.taskSpec.generatedTests && isSafeAssertOnlyBlock(input.taskSpec.generatedTests)) {
      const result = await this.validator.run(input.context.currentCode, input.taskSpec.generatedTests, input.pythonPath);
      return {
        ...result,
        source: "llm_generated_tests",
        confidence: result.status === "unavailable" ? "low" : "medium",
        hasReliableCheck: result.status === "passed" || result.status === "failed"
      };
    }

    return {
      status: "unavailable",
      summary: "No reliable PyBryt, assert, pytest, or validated generated-test evidence was available.",
      source: "none",
      confidence: "low",
      hasReliableCheck: false
    };
  }
}

function findAssociatedCheckCell(context: NotebookContext): {
  cell: NotebookContext["nearbyCodeCells"][number];
  source: "assert" | "pytest";
} | undefined {
  const firstFollowingCode = context.nearbyCodeCells
    .filter((candidate) => candidate.cellIndex > context.cellIndex)
    .sort((left, right) => left.cellIndex - right.cellIndex)[0];
  if (!firstFollowingCode) return undefined;
  if (/(?:^|\n)\s*(?:!|%)?pytest\b|\bpytest\.main\s*\(|(?:^|\n)\s*(?:async\s+)?def\s+test_|(?:^|\n)\s*import\s+unittest\b|unittest\.main\s*\(/m.test(firstFollowingCode.code)) {
    return { cell: firstFollowingCode, source: "pytest" };
  }
  return /^\s*assert\b/m.test(firstFollowingCode.code)
    ? { cell: firstFollowingCode, source: "assert" }
    : undefined;
}

function evidenceFromRuntimeOutput(rawOutput: string, executionSuccess?: boolean): TestEvidence {
  const output = rawOutput.slice(0, 1200);
  if (executionSuccess === false) {
    return { status: "failed", summary: output || "The selected cell execution failed.", source: "runtime_error", confidence: "high", hasReliableCheck: true };
  }
  if (!output.trim()) return { status: "not_run", summary: "The current cell has no test output.", source: "cell_output", confidence: "low", hasReliableCheck: false };
  if (/Traceback \(most recent call last\)/m.test(output)) {
    return { status: "failed", summary: output, source: "runtime_error", confidence: "medium", hasReliableCheck: true };
  }
  return { status: "not_run", summary: output, source: "cell_output", confidence: "low", hasReliableCheck: false };
}

function isSafeAssertOnlyBlock(code: string): boolean {
  const lines = code.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (/;|\b(?:open|exec|eval|compile|__import__|subprocess|socket)\s*\(|\b(?:os|sys|pathlib|shutil)\s*\./.test(code)) return false;
  return lines.some((line) => /^assert\b/.test(line))
    && lines.every((line) => /^#/.test(line)
      || /^assert\b/.test(line)
      || /^import\s+math\s*$/.test(line)
      || /^from\s+math\s+import\s+[A-Za-z_,\s]+$/.test(line));
}
