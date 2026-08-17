import { promises as fs } from "fs";
import * as path from "path";
import { createDecisionTrace, DecisionTrace } from "../src/adaptive/core/decisionTrace";
import { CourseContext, DecisionEngine, DecisionInput } from "../src/adaptive/core/decisionEngine";
import { DecisionPolicy, FixedPolicy, FullAdaptivePolicy, NoHistoryPolicy } from "../src/adaptive/core/policies";
import { AdaptiveAction, AttemptRecord, LearnerState, TaskSpec, TestEvidence } from "../src/adaptive/types";

export interface EvaluationState {
  stateId: string;
  description: string;
  studentCode: string;
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: AttemptRecord[];
  courseContext?: CourseContext;
  expectedStatus: "action" | "needs_evidence";
  acceptableActions: AdaptiveAction[];
  forbiddenActions: AdaptiveAction[];
  comparisonGroups?: string[];
}

export interface EvaluationResult extends DecisionTrace {
  description: string;
  studentCode: string;
  expectedStatus: EvaluationState["expectedStatus"];
  acceptableActions: AdaptiveAction[];
  forbiddenActions: AdaptiveAction[];
  acceptable: boolean;
  forbiddenViolation: boolean;
  comparisonGroups?: string[];
}

const POLICIES: DecisionPolicy[] = [new FixedPolicy(), new NoHistoryPolicy(), new FullAdaptivePolicy()];

export function evaluateStates(states: EvaluationState[], policies = POLICIES): EvaluationResult[] {
  const results: EvaluationResult[] = [];
  for (const state of states) {
    const input: DecisionInput = {
      taskSpec: state.taskSpec,
      evidence: state.evidence,
      learnerBefore: state.learnerBefore,
      history: state.history,
      courseContext: state.courseContext
    };
    for (const policy of policies) {
      const started = process.hrtime.bigint();
      const decision = new DecisionEngine(policy).decide(input);
      const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const action = decision.status === "action" ? decision.action : undefined;
      const acceptable = decision.status === state.expectedStatus
        && (decision.status === "needs_evidence" || state.acceptableActions.includes(decision.action));
      results.push({
        ...createDecisionTrace({
          stateId: state.stateId,
          participantId: state.learnerBefore.studentId,
          taskSpec: state.taskSpec,
          evidence: state.evidence,
          learnerBefore: state.learnerBefore,
          history: state.history,
          decision,
          latencyMs,
          modelVersion: "not-used-for-policy-evaluation",
          promptVersion: "not-used-for-policy-evaluation"
        }),
        description: state.description,
        studentCode: state.studentCode,
        expectedStatus: state.expectedStatus,
        acceptableActions: state.acceptableActions,
        forbiddenActions: state.forbiddenActions,
        acceptable,
        forbiddenViolation: Boolean(action && state.forbiddenActions.includes(action)),
        comparisonGroups: state.comparisonGroups
      });
    }
  }
  return results;
}

export function parseStates(content: string): EvaluationState[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as EvaluationState;
    } catch (error) {
      throw new Error(`Invalid JSON on state line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function main(): Promise<void> {
  const split = argument("--split") ?? process.argv.slice(2).find((value) => !value.startsWith("-")) ?? "dev";
  if (!/^[a-z0-9_-]+$/i.test(split)) throw new Error(`Invalid split name: ${split}`);
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const statesPath = path.join(pluginRoot, "evaluation", "states", `${split}.jsonl`);
  const outputDir = path.join(pluginRoot, "evaluation", "results");
  const states = parseStates(await fs.readFile(statesPath, "utf8"));
  if (!states.length) throw new Error(`No states found in ${statesPath}`);
  const results = evaluateStates(states);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `${split}-policy-results.jsonl`), `${results.map((result) => JSON.stringify(result)).join("\n")}\n`, "utf8");
  await fs.writeFile(path.join(outputDir, `${split}-policy-results.csv`), toCsv(results), "utf8");
  printSummary(split, states.length, results);
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function toCsv(results: EvaluationResult[]): string {
  const header = ["state_id", "policy", "policy_version", "status", "action", "acceptable", "forbidden_violation", "reason_codes", "latency_ms"];
  const rows = results.map((result) => [
    result.stateId,
    result.policy,
    result.policyVersion,
    result.status,
    result.action ?? "",
    result.acceptable,
    result.forbiddenViolation,
    result.reasonCodes.join("|"),
    result.latencyMs.toFixed(3)
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number | boolean): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function printSummary(split: string, stateCount: number, results: EvaluationResult[]): void {
  process.stdout.write(`split=${split} states=${stateCount} decisions=${results.length}\n`);
  for (const policy of POLICIES) {
    const policyResults = results.filter((result) => result.policy === policy.name);
    const acceptable = policyResults.filter((result) => result.acceptable).length;
    const forbidden = policyResults.filter((result) => result.forbiddenViolation).length;
    process.stdout.write(`${policy.name}: acceptable=${acceptable}/${policyResults.length} forbidden=${forbidden}\n`);
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
