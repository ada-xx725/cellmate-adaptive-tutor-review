import { promises as fs } from "fs";
import * as path from "path";
import { createDecisionTrace, DecisionTrace } from "../src/adaptive/core/decisionTrace";
import { DecisionEngine, DecisionInput } from "../src/adaptive/core/decisionEngine";
import { LlmDecisionEngine } from "../src/adaptive/core/llmDecisionEngine";
import { FullAdaptivePolicy } from "../src/adaptive/core/policies";
import { LLM_NEXT_STEP_PROMPT_VERSION } from "../src/adaptive/llmNextStepSelector";
import { AdaptiveAction, AttemptRecord, LearnerState, TaskSpec, TestEvidence } from "../src/adaptive/types";

interface DemoActionCase {
  caseId: string;
  title: string;
  description: string;
  expectedAction: AdaptiveAction;
  decisionSource: "full_adaptive_policy" | "llm_selector_replay";
  studentCode: string;
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learnerBefore: LearnerState;
  history: AttemptRecord[];
  courseContext?: DecisionInput["courseContext"];
}

interface DemoActionTrace extends DecisionTrace {
  caseTitle: string;
  caseDescription: string;
  studentCode: string;
  expectedAction: AdaptiveAction;
  decisionSource: DemoActionCase["decisionSource"];
  matchedExpectedAction: boolean;
  traceNote: string;
}

async function main(): Promise<void> {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const casesPath = path.join(pluginRoot, "demo", "action-cases.jsonl");
  const outputDir = path.join(pluginRoot, "demo", "action-traces");
  const cases = parseCases(await fs.readFile(casesPath, "utf8"));
  const traces: DemoActionTrace[] = [];

  for (const actionCase of cases) {
    const input: DecisionInput = {
      taskSpec: actionCase.taskSpec,
      evidence: actionCase.evidence,
      learnerBefore: actionCase.learnerBefore,
      history: actionCase.history,
      courseContext: actionCase.courseContext
    };
    const started = process.hrtime.bigint();
    const decision = actionCase.decisionSource === "llm_selector_replay"
      ? await replayLlmHint(input)
      : new DecisionEngine(new FullAdaptivePolicy()).decide(input);
    const latencyMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const matchedExpectedAction = decision.status === "action" && decision.action === actionCase.expectedAction;
    if (!matchedExpectedAction) {
      throw new Error(
        `${actionCase.caseId}: expected ${actionCase.expectedAction}, got ${
          decision.status === "action" ? decision.action : decision.status
        }`
      );
    }

    traces.push({
      ...createDecisionTrace({
        stateId: actionCase.caseId,
        participantId: actionCase.learnerBefore.studentId,
        taskSpec: actionCase.taskSpec,
        evidence: actionCase.evidence,
        learnerBefore: actionCase.learnerBefore,
        history: actionCase.history,
        decision,
        latencyMs,
        modelVersion: actionCase.decisionSource === "llm_selector_replay"
          ? "demo-scripted-selector-replay"
          : "not-used-rule-coverage",
        promptVersion: actionCase.decisionSource === "llm_selector_replay"
          ? LLM_NEXT_STEP_PROMPT_VERSION
          : "not-used-rule-coverage"
      }),
      caseTitle: actionCase.title,
      caseDescription: actionCase.description,
      studentCode: actionCase.studentCode,
      expectedAction: actionCase.expectedAction,
      decisionSource: actionCase.decisionSource,
      matchedExpectedAction,
      traceNote: actionCase.decisionSource === "llm_selector_replay"
        ? "Production LlmDecisionEngine trace using a fixed selector replay for deterministic HINT coverage; this is not a live model call."
        : "Production DecisionEngine trace using FullAdaptivePolicy on a frozen demo input."
    });
  }

  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all(traces.map((trace) =>
    fs.writeFile(
      path.join(outputDir, `${trace.stateId}-${trace.action?.toLowerCase()}.json`),
      `${JSON.stringify(trace, null, 2)}\n`,
      "utf8"
    )
  ));
  await fs.writeFile(
    path.join(outputDir, "action-case-summary.jsonl"),
    `${traces.map((trace) => JSON.stringify(trace)).join("\n")}\n`,
    "utf8"
  );

  for (const trace of traces) {
    process.stdout.write(
      `${trace.stateId}: ${trace.action} source=${trace.decisionSource} matched=${trace.matchedExpectedAction}\n`
    );
  }
}

function parseCases(content: string): DemoActionCase[] {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as DemoActionCase;
      } catch (error) {
        throw new Error(
          `Invalid JSON on demo action case line ${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
    });
}

async function replayLlmHint(input: DecisionInput) {
  const engine = new LlmDecisionEngine({
    select: async () => ({
      action: "HINT" as const,
      reason:
        "The learner has made a first, local accumulator update error. One targeted clue is enough before adding structure or changing the task.",
      evidenceReferences: [
        input.evidence.summary,
        "No previous failed attempt is present for this exercise."
      ],
      confidence: 0.88
    })
  });
  return engine.decide(input);
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
