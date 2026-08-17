import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { promises as fs, readFileSync } from "fs";
import * as path from "path";
import { createDecisionTrace, DecisionTrace } from "../src/adaptive/core/decisionTrace";
import { CourseContext, DecisionEngine, DecisionInput, DecisionResult } from "../src/adaptive/core/decisionEngine";
import { LlmDecisionEngine } from "../src/adaptive/core/llmDecisionEngine";
import { FixedPolicy, FullAdaptivePolicy, NoHistoryPolicy } from "../src/adaptive/core/policies";
import {
  buildDecisionEvidenceCatalog,
  LLM_NEXT_STEP_PROMPT_VERSION,
  LlmNextStepSelector
} from "../src/adaptive/llmNextStepSelector";
import { reasonsEvidenceIsInsufficient } from "../src/adaptive/policy";
import {
  AdaptiveAction,
  AttemptRecord,
  EvidenceConfidence,
  EvidenceSource,
  LearnerState,
  SourceMode,
  TaskSpec,
  TestEvidence
} from "../src/adaptive/types";
import { hasUsableLLMConfig, LLMConfig } from "../src/llmConfiguration";
import { LlmTransport, LlmTransportError, LlmTransportErrorCategory } from "../src/llmTransport";

export const ACTION_QUALITY_RUN_SCHEMA_VERSION = 1;
export const ACTION_QUALITY_SUITE_VERSION = "evaluation-policy-suite-v3";

export type ActionQualityCondition = "fixed-v2" | "full-adaptive-v1" | "llm-next-step-v6" | "no-history-v1";
export type HardConstraintViolation =
  | "INVALID_STATUS_OR_ACTION"
  | "INSUFFICIENT_EVIDENCE_RECEIVED_ACTION"
  | "SUFFICIENT_EVIDENCE_RECEIVED_NEEDS_EVIDENCE"
  | "FAILED_EVIDENCE_RECEIVED_PROGRESSION"
  | "PASSED_EVIDENCE_RECEIVED_REMEDIATION"
  | "NEXT_CONCEPT_WITHOUT_COURSE_TARGET"
  | "LLM_SELECTION_WITHOUT_VALID_PROVENANCE";

interface FormalTask {
  id: string;
  title: string;
  task_summary: string;
  expected_behavior: string;
  primary_concept: string;
  target_concepts: string[];
  difficulty: number;
}

interface FormalEvidence {
  status: TestEvidence["status"];
  summary: string;
  source: string;
  confidence: EvidenceConfidence;
  has_reliable_check: boolean;
  error_signature?: string | null;
  test_coverage: {
    summary: string;
    passed_checks: number;
    total_checks: number;
    categories: string[];
    not_covered?: string[];
  };
}

interface FormalHistoryEntry {
  attempt_index: number;
  evidence_status: TestEvidence["status"];
  support_received: { type: string; summary: string };
  support_outcome: string;
}

export interface FormalActionQualityState {
  schema_version: 1;
  annotation_guide_version: string;
  state_pack_version: string;
  state_id: string;
  stratum: string;
  source_mode: SourceMode;
  counterfactual_pair_id?: string | null;
  task: FormalTask;
  student_code: string;
  evidence: FormalEvidence;
  learner_before: {
    scale_note: string;
    concepts: Record<string, { score: number; band: string }>;
  };
  history: FormalHistoryEntry[];
  course_context?: {
    exercise_id?: string;
    difficulty?: number;
    next_exercises?: string[];
    next_concepts?: string[];
  } | null;
}

export interface ActionQualityRunRecord {
  schemaVersion: 1;
  suiteVersion: typeof ACTION_QUALITY_SUITE_VERSION;
  runId: string;
  statePackVersion: string;
  stateId: string;
  stratum: string;
  sourceMode: SourceMode;
  condition: ActionQualityCondition;
  executionStatus: "completed" | "error";
  inputSha256: string;
  selectorConfigurationFingerprint: string;
  needsEvidenceExpected: boolean;
  needsEvidenceCorrect?: boolean;
  hardConstraintViolations: HardConstraintViolation[];
  transportOutcome: "not_applicable" | "not_called" | "selected" | "rule_fallback" | "error";
  errorCategory?: LlmTransportErrorCategory;
  trace?: DecisionTrace;
}

interface AsyncDecisionEngine {
  decide(input: DecisionInput): Promise<DecisionResult>;
}

interface JsonTransport {
  completeJson<T>(config: LLMConfig, request: { system?: string; prompt: string; timeoutMs?: number }): Promise<T>;
}

export interface ActionQualityRunOptions {
  runId: string;
  selectorModelVersion: string;
  selectorConfigurationFingerprint: string;
  llmEngine: AsyncDecisionEngine;
  createdAt?: string;
  clock?: () => bigint;
}

export function parseFormalActionQualityStates(content: string): FormalActionQualityState[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as FormalActionQualityState;
    } catch (error) {
      throw new Error(`Invalid JSON on formal state line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

export function formalStateToDecisionInput(state: FormalActionQualityState): DecisionInput {
  if (state.schema_version !== 1 || state.state_pack_version !== "action-quality-states-v2") {
    throw new Error(`Unsupported formal state version for ${state.state_id}.`);
  }
  const taskSpec: TaskSpec = {
    id: state.task.id,
    sourceMode: state.source_mode,
    title: state.task.title,
    taskSummary: state.task.task_summary,
    expectedBehavior: state.task.expected_behavior,
    promptMarkdown: `${state.task.task_summary}\n\nExpected behaviour: ${state.task.expected_behavior}`,
    targetConcepts: [...state.task.target_concepts],
    primaryConcept: state.task.primary_concept,
    difficulty: state.task.difficulty,
    confidence: 1
  };
  const evidence: TestEvidence = {
    status: state.evidence.status,
    summary: evidenceSummary(state.evidence),
    source: evidenceSource(state.evidence.source),
    confidence: state.evidence.confidence,
    hasReliableCheck: state.evidence.has_reliable_check
  };
  const learnerBefore: LearnerState = {
    studentId: `constructed:${state.state_id}`,
    mastery: Object.fromEntries(
      Object.entries(state.learner_before.concepts).map(([concept, value]) => [concept, value.score])
    )
  };
  return {
    taskSpec,
    evidence,
    learnerBefore,
    history: state.history.map((entry) => historyAttempt(state, taskSpec, entry)),
    courseContext: courseContext(state)
  };
}

export function selectorConfigFromEnvironment(env: NodeJS.ProcessEnv): LLMConfig {
  const config = {
    apiUrl: env.CELLMATE_EVAL_SELECTOR_API_URL?.trim() ?? "",
    apiKey: env.CELLMATE_EVAL_SELECTOR_API_KEY ?? "",
    modelName: env.CELLMATE_EVAL_SELECTOR_MODEL?.trim() ?? ""
  };
  if (!hasUsableLLMConfig(config)) {
    throw new LlmTransportError(
      "configuration",
      "CELLMATE_EVAL_SELECTOR_API_URL and CELLMATE_EVAL_SELECTOR_MODEL are required.",
      false
    );
  }
  return config;
}

export function selectorConfigurationFingerprint(config: LLMConfig): string {
  return sha256(JSON.stringify({
    apiUrl: config.apiUrl,
    modelName: config.modelName,
    apiKeyConfigured: Boolean(config.apiKey)
  }));
}

export function createProductionLlmEngine(
  config: LLMConfig,
  transport: JsonTransport = new LlmTransport()
): LlmDecisionEngine {
  const completer = {
    completeJson: <T>(request: { system: string; prompt: string; timeoutMs?: number }): Promise<T | undefined> =>
      transport.completeJson<T>(config, request)
  };
  return new LlmDecisionEngine(new LlmNextStepSelector(completer));
}

export async function runActionQualityStates(
  states: FormalActionQualityState[],
  options: ActionQualityRunOptions
): Promise<ActionQualityRunRecord[]> {
  if (!states.length) throw new Error("The action-quality state pack is empty.");
  const createdAt = options.createdAt ?? new Date().toISOString();
  const clock = options.clock ?? (() => process.hrtime.bigint());
  const engines: Array<{
    condition: ActionQualityCondition;
    modelVersion: string;
    promptVersion: string;
    decide(input: DecisionInput): Promise<DecisionResult>;
  }> = [
    syncEngine("fixed-v2", new DecisionEngine(new FixedPolicy())),
    syncEngine("full-adaptive-v1", new DecisionEngine(new FullAdaptivePolicy())),
    {
      condition: "llm-next-step-v6",
      modelVersion: options.selectorModelVersion,
      promptVersion: LLM_NEXT_STEP_PROMPT_VERSION,
      decide: (input) => options.llmEngine.decide(input)
    },
    syncEngine("no-history-v1", new DecisionEngine(new NoHistoryPolicy()))
  ];

  const records: ActionQualityRunRecord[] = [];
  for (const state of states) {
    const input = formalStateToDecisionInput(state);
    const inputSha256 = sha256(JSON.stringify(input));
    const needsEvidenceExpected = reasonsEvidenceIsInsufficient(input.evidence).length > 0;
    for (const engine of engines) {
      const started = clock();
      try {
        const decision = await engine.decide(input);
        const latencyMs = Number(clock() - started) / 1_000_000;
        const trace = createDecisionTrace({
          stateId: state.state_id,
          participantId: input.learnerBefore.studentId,
          taskSpec: input.taskSpec,
          evidence: input.evidence,
          learnerBefore: input.learnerBefore,
          history: input.history,
          decision,
          latencyMs,
          modelVersion: engine.modelVersion,
          promptVersion: engine.promptVersion,
          createdAt
        });
        records.push({
          schemaVersion: ACTION_QUALITY_RUN_SCHEMA_VERSION,
          suiteVersion: ACTION_QUALITY_SUITE_VERSION,
          runId: options.runId,
          statePackVersion: state.state_pack_version,
          stateId: state.state_id,
          stratum: state.stratum,
          sourceMode: state.source_mode,
          condition: engine.condition,
          executionStatus: "completed",
          inputSha256,
          selectorConfigurationFingerprint: options.selectorConfigurationFingerprint,
          needsEvidenceExpected,
          needsEvidenceCorrect: (decision.status === "needs_evidence") === needsEvidenceExpected,
          hardConstraintViolations: findHardConstraintViolations(input, decision),
          transportOutcome: transportOutcome(engine.condition, trace),
          trace
        });
      } catch (error) {
        records.push({
          schemaVersion: ACTION_QUALITY_RUN_SCHEMA_VERSION,
          suiteVersion: ACTION_QUALITY_SUITE_VERSION,
          runId: options.runId,
          statePackVersion: state.state_pack_version,
          stateId: state.state_id,
          stratum: state.stratum,
          sourceMode: state.source_mode,
          condition: engine.condition,
          executionStatus: "error",
          inputSha256,
          selectorConfigurationFingerprint: options.selectorConfigurationFingerprint,
          needsEvidenceExpected,
          hardConstraintViolations: [],
          transportOutcome: "error",
          errorCategory: transportErrorCategory(error)
        });
      }
    }
  }
  return records;
}

export function findHardConstraintViolations(
  input: DecisionInput,
  decision: DecisionResult
): HardConstraintViolation[] {
  const violations: HardConstraintViolation[] = [];
  const status = (decision as { status?: unknown }).status;
  const action = (decision as { action?: unknown }).action;
  const actionValid = typeof action === "string" && ACTIONS.includes(action as AdaptiveAction);
  const needsEvidence = reasonsEvidenceIsInsufficient(input.evidence).length > 0;

  if ((status !== "action" && status !== "needs_evidence")
    || (status === "action" && !actionValid)
    || (status === "needs_evidence" && action !== undefined)) {
    violations.push("INVALID_STATUS_OR_ACTION");
  }
  if (needsEvidence && status === "action") violations.push("INSUFFICIENT_EVIDENCE_RECEIVED_ACTION");
  if (!needsEvidence && status === "needs_evidence") violations.push("SUFFICIENT_EVIDENCE_RECEIVED_NEEDS_EVIDENCE");
  if (input.evidence.status === "failed" && (action === "HARDER" || action === "NEXT_CONCEPT")) {
    violations.push("FAILED_EVIDENCE_RECEIVED_PROGRESSION");
  }
  if (input.evidence.status === "passed" && ["HINT", "RETRY_WITH_SCAFFOLD", "EASIER"].includes(String(action))) {
    violations.push("PASSED_EVIDENCE_RECEIVED_REMEDIATION");
  }
  if (action === "NEXT_CONCEPT" && !(input.courseContext?.nextConcepts?.length)) {
    violations.push("NEXT_CONCEPT_WITHOUT_COURSE_TARGET");
  }
  if (decision.policy === "llm_adaptive" && status === "action" && decision.fallbackUsed !== true
    && !hasValidSelectionProvenance(input, action as AdaptiveAction, decision.selectionEvidenceReferences)) {
    violations.push("LLM_SELECTION_WITHOUT_VALID_PROVENANCE");
  }
  return violations;
}

export function buildActionQualityRunManifest(input: {
  runId: string;
  seed: string;
  recordsText: string;
  records: ActionQualityRunRecord[];
  stateManifest: Record<string, unknown>;
  protocolManifest: Record<string, unknown>;
  selectorModelVersion: string;
  selectorConfigurationFingerprint: string;
  sourceCommit: string;
  sourceDirty: boolean;
  sourceStatusSha256: string;
  createdAt: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    suiteVersion: ACTION_QUALITY_SUITE_VERSION,
    runId: input.runId,
    seed: input.seed,
    statePackVersion: input.stateManifest.statePackVersion,
    statePackSha256: input.stateManifest.sha256,
    protocolVersion: input.protocolManifest.protocolVersion,
    selectorPromptVersion: LLM_NEXT_STEP_PROMPT_VERSION,
    selectorModelVersion: input.selectorModelVersion,
    selectorConfigurationFingerprint: input.selectorConfigurationFingerprint,
    sourceCommit: input.sourceCommit,
    sourceDirty: input.sourceDirty,
    sourceStatusSha256: input.sourceStatusSha256,
    recordCount: input.records.length,
    completedCount: input.records.filter((record) => record.executionStatus === "completed").length,
    errorCount: input.records.filter((record) => record.executionStatus === "error").length,
    recordsSha256: sha256(input.recordsText),
    apiKeyRecorded: false,
    rawProviderResponsesRecorded: false,
    createdAt: input.createdAt
  };
}

function syncEngine(condition: ActionQualityCondition, engine: DecisionEngine) {
  return {
    condition,
    modelVersion: "not-used-for-deterministic-condition",
    promptVersion: "not-used-for-deterministic-condition",
    decide: async (input: DecisionInput) => engine.decide(input)
  };
}

function evidenceSummary(evidence: FormalEvidence): string {
  const notCovered = evidence.test_coverage.not_covered?.length
    ? ` Not covered: ${evidence.test_coverage.not_covered.join(", ")}.`
    : "";
  return `${evidence.summary} Coverage: ${evidence.test_coverage.summary}${notCovered}`;
}

function evidenceSource(source: string): EvidenceSource {
  const sources: Record<string, EvidenceSource> = {
    explicit_asserts: "assert",
    visible_assert_subset: "assert",
    pybryt: "pybryt",
    pytest: "pytest",
    unittest: "pytest",
    generated_verifier: "llm_generated_tests",
    runtime_error: "runtime_error"
  };
  const mapped = sources[source];
  if (!mapped) throw new Error(`Unsupported formal evidence source: ${source}`);
  return mapped;
}

function historyAttempt(
  state: FormalActionQualityState,
  taskSpec: TaskSpec,
  entry: FormalHistoryEntry
): AttemptRecord {
  const action = historyAction(entry.support_received.type);
  return {
    participantId: `constructed:${state.state_id}`,
    fingerprint: `history:${sha256(`${state.state_id}|${entry.attempt_index}`).slice(0, 24)}`,
    exerciseId: state.task.id,
    action,
    evidence: {
      status: entry.evidence_status,
      summary: `Recorded outcome: ${entry.support_outcome}.`,
      source: "none",
      confidence: entry.evidence_status === "passed" || entry.evidence_status === "failed" ? "high" : "low",
      hasReliableCheck: entry.evidence_status === "passed" || entry.evidence_status === "failed"
    },
    taskSpec,
    createdAt: `2026-01-${String(Math.min(entry.attempt_index, 28)).padStart(2, "0")}T00:00:00.000Z`
  };
}

function historyAction(type: string): AdaptiveAction {
  const actions: Record<string, AdaptiveAction> = {
    hint: "HINT",
    scaffold: "RETRY_WITH_SCAFFOLD",
    easier: "EASIER",
    similar: "SIMILAR",
    harder: "HARDER",
    next_concept: "NEXT_CONCEPT"
  };
  const action = actions[type];
  if (!action) throw new Error(`History support type cannot be mapped to a production action: ${type}`);
  return action;
}

function courseContext(state: FormalActionQualityState): CourseContext | undefined {
  if (!state.course_context) return undefined;
  return {
    exerciseId: state.course_context.exercise_id,
    difficulty: state.course_context.difficulty ?? state.task.difficulty,
    nextExercises: state.course_context.next_exercises,
    nextConcepts: state.course_context.next_concepts
  };
}

function hasValidSelectionProvenance(
  input: DecisionInput,
  action: AdaptiveAction,
  references: string[] | undefined
): boolean {
  if (!references || references.length < 1 || references.length > 5 || new Set(references).size !== references.length) {
    return false;
  }
  const catalog = new Map(buildDecisionEvidenceCatalog(input).map((entry) => [entry.id, entry.kind]));
  if (references.some((reference) => !catalog.has(reference)) || !references.includes("check:current")) return false;
  if ((action === "HARDER" || action === "NEXT_CONCEPT")
    && !references.some((reference) => catalog.get(reference) === "mastery")) return false;
  if (action === "NEXT_CONCEPT" && Array.from(catalog.values()).includes("course")
    && !references.some((reference) => catalog.get(reference) === "course")) return false;
  return true;
}

function transportOutcome(
  condition: ActionQualityCondition,
  trace: DecisionTrace
): ActionQualityRunRecord["transportOutcome"] {
  if (condition !== "llm-next-step-v6") return "not_applicable";
  if (trace.selectorOutcome === "not_called") return "not_called";
  return trace.selectorOutcome === "rule_fallback" ? "rule_fallback" : "selected";
}

function transportErrorCategory(error: unknown): LlmTransportErrorCategory {
  return error instanceof LlmTransportError ? error.category : "unknown";
}

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

function verifyProtocolFreeze(pluginRoot: string): Record<string, unknown> {
  const manifestPath = path.join(pluginRoot, "evaluation", "ACTION_QUALITY_PROTOCOL_FREEZE_V2.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    files?: Record<string, string>;
    [key: string]: unknown;
  };
  for (const [relativePath, expected] of Object.entries(manifest.files ?? {})) {
    const actual = sha256(readFileSync(path.join(pluginRoot, relativePath), "utf8"));
    if (actual !== expected) throw new Error(`Frozen protocol artifact changed: ${relativePath}`);
  }
  return manifest;
}

async function main(): Promise<void> {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const runId = requiredArgument("--run-id");
  const seed = requiredArgument("--seed");
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(runId)) throw new Error("--run-id contains unsupported characters.");
  if (!/^[0-9]+$/.test(seed)) throw new Error("--seed must be a non-negative integer string.");

  const status = execFileSync("git", ["status", "--porcelain"], { cwd: pluginRoot, encoding: "utf8" });
  if (status.trim() && !process.argv.includes("--allow-dirty")) {
    throw new Error("Refusing a formal run from a dirty tree. Use a clean worktree or pass --allow-dirty explicitly.");
  }
  const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: pluginRoot, encoding: "utf8" }).trim();
  const protocolManifest = verifyProtocolFreeze(pluginRoot);
  const builder = require(path.join(pluginRoot, "evaluation", "annotation", "buildActionQualityStatePackV2.js")) as {
    verifyCommittedPack(): { states: FormalActionQualityState[]; manifest: Record<string, unknown> };
  };
  const { states, manifest: stateManifest } = builder.verifyCommittedPack();
  const config = selectorConfigFromEnvironment(process.env);
  const fingerprint = selectorConfigurationFingerprint(config);
  const createdAt = new Date().toISOString();
  const outputDir = path.join(pluginRoot, "evaluation", "results");
  const recordsPath = path.join(outputDir, `${runId}.records.jsonl`);
  const manifestPath = path.join(outputDir, `${runId}.manifest.json`);
  await assertAbsent(recordsPath);
  await assertAbsent(manifestPath);

  const records = await runActionQualityStates(states, {
    runId,
    selectorModelVersion: config.modelName,
    selectorConfigurationFingerprint: fingerprint,
    llmEngine: createProductionLlmEngine(config),
    createdAt
  });
  const recordsText = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const runManifest = buildActionQualityRunManifest({
    runId,
    seed,
    recordsText,
    records,
    stateManifest,
    protocolManifest,
    selectorModelVersion: config.modelName,
    selectorConfigurationFingerprint: fingerprint,
    sourceCommit,
    sourceDirty: Boolean(status.trim()),
    sourceStatusSha256: sha256(status),
    createdAt
  });
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(recordsPath, recordsText, { encoding: "utf8", flag: "wx" });
  await fs.writeFile(manifestPath, `${JSON.stringify(runManifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`run=${runId} states=${states.length} records=${records.length} errors=${records.filter((record) => record.executionStatus === "error").length}\n`);
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

async function assertAbsent(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
    throw new Error(`Refusing to overwrite existing locked artifact: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const ACTIONS: AdaptiveAction[] = ["HINT", "RETRY_WITH_SCAFFOLD", "EASIER", "SIMILAR", "HARDER", "NEXT_CONCEPT"];

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
