import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import { GeneratedCandidate, TestEvidence, ValidationResult } from "./types";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_CAPTURED_OUTPUT = 12_000;

export class PythonValidator {
  async run(code: string, testCode: string, pythonPath: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<TestEvidence> {
    return new Promise((resolve) => {
      let settled = false;
      let output = "";
      const finish = (evidence: TestEvidence): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(evidence);
      };
      const appendOutput = (chunk: Buffer): void => {
        if (output.length < MAX_CAPTURED_OUTPUT) output += chunk.toString().slice(0, MAX_CAPTURED_OUTPUT - output.length);
      };

      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(pythonPath, ["-c", "import sys; ns = {}; exec(sys.stdin.read(), ns, ns)"], { windowsHide: true });
      } catch (error) {
        resolve({ status: "unavailable", summary: error instanceof Error ? error.message : String(error), confidence: "low", hasReliableCheck: false });
        return;
      }

      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch { /* process may already have exited */ }
        finish({
          status: "unavailable",
          summary: `Python execution timed out after ${timeoutMs} ms.`,
          confidence: "low",
          hasReliableCheck: false
        });
      }, timeoutMs);

      child.stdout.on("data", appendOutput);
      child.stderr.on("data", appendOutput);
      child.stdin.on("error", (error) => finish({ status: "unavailable", summary: error.message, confidence: "low", hasReliableCheck: false }));
      child.on("error", (error) => finish({ status: "unavailable", summary: error.message, confidence: "low", hasReliableCheck: false }));
      child.on("close", (codeStatus) => finish({
        status: codeStatus === 0 ? "passed" : "failed",
        summary: output.slice(0, 1200),
        confidence: "high",
        hasReliableCheck: true
      }));
      child.stdin.end(`${code}\n\n${testCode}`);
    });
  }

  async validate(candidate: GeneratedCandidate, pythonPath: string): Promise<boolean> {
    return (await this.validateDetailed(candidate, pythonPath)).ok;
  }

  async validateDetailed(candidate: GeneratedCandidate, pythonPath: string): Promise<ValidationResult> {
    const importsAllowed = importsAreAllowed(`${candidate.starterCode}\n${candidate.referenceSolution}\n${candidate.negativeCandidate ?? ""}\n${candidate.testCode}`);
    const namesMatch = functionNamesMatch(candidate);
    const hasAssertions = testsHaveAssertions(candidate.testCode);
    if (!importsAllowed || !namesMatch || !hasAssertions) {
      return {
        ok: false,
        referencePassed: false,
        starterFailed: false,
        negativeFailed: candidate.negativeCandidate ? false : undefined,
        importsAllowed,
        functionNamesMatch: namesMatch,
        summary: `Static validation failed. importsAllowed=${importsAllowed}; functionNamesMatch=${namesMatch}; hasAssertions=${hasAssertions}.`
      };
    }
    const reference = await this.run(candidate.referenceSolution, candidate.testCode, pythonPath);
    if (reference.status !== "passed") {
      return {
        ok: false,
        referencePassed: false,
        starterFailed: false,
        negativeFailed: candidate.negativeCandidate ? false : undefined,
        importsAllowed,
        functionNamesMatch: namesMatch,
        summary: `Reference solution failed: ${reference.summary}`
      };
    }
    const starter = await this.run(candidate.starterCode, candidate.testCode, pythonPath);
    const negative = candidate.negativeCandidate ? await this.run(candidate.negativeCandidate, candidate.testCode, pythonPath) : undefined;
    const starterFailed = starter.status === "failed";
    const negativeFailed = negative ? negative.status === "failed" : undefined;
    const ok = starterFailed && (negativeFailed ?? true);
    return {
      ok,
      referencePassed: true,
      starterFailed,
      negativeFailed,
      importsAllowed,
      functionNamesMatch: namesMatch,
      summary: ok
        ? "Generated exercise passed validation."
        : `Generated exercise failed validation. starter=${starter.status}; negative=${negative?.status ?? "not_provided"}; ${starter.summary || negative?.summary || ""}`
    };
  }
}

function importsAreAllowed(code: string): boolean {
  const imports = Array.from(code.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/gm)).map((match) => match[1].split(".")[0]);
  return imports.every((moduleName) => ["math"].includes(moduleName));
}

function functionNamesMatch(candidate: GeneratedCandidate): boolean {
  const referenceName = candidate.referenceSolution.match(/def\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  if (!referenceName) return true;
  const starterName = candidate.starterCode.match(/def\s+([A-Za-z_]\w*)\s*\(/)?.[1];
  const testMentionsReference = new RegExp(`\\b${referenceName}\\s*\\(`).test(candidate.testCode);
  return (!starterName || starterName === referenceName) && testMentionsReference;
}

function testsHaveAssertions(code: string): boolean {
  return /\bassert\b/.test(code);
}
