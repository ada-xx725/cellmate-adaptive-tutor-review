import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import {
  ActionQualityCondition,
  ActionQualityRunRecord,
  FormalActionQualityState
} from "./actionQualityRunner";
import { hasUsableLLMConfig, LLMConfig } from "../src/llmConfiguration";
import { LlmTransport, LlmTransportError, LlmTransportErrorCategory } from "../src/llmTransport";

export const ACTION_QUALITY_JUDGE_VERSION = "action-quality-judge-v1";
export const ACTION_QUALITY_JUDGE_SCHEMA_VERSION = 1;

export interface StateEvidenceCatalogEntry {
  id: string;
  value: string;
}

export interface BlindedJudgeCandidate {
  candidateId: string;
  sourceRunId: string;
  stateId: string;
  condition: ActionQualityCondition;
  candidateStatus: "action" | "needs_evidence";
  candidateAction?: string;
  state: FormalActionQualityState;
}

export interface ValidJudgeAssessment {
  score: number;
  criticalError: boolean;
  confidence: number;
  reason: string;
  evidenceReferences: string[];
}

export interface JudgeRecord {
  schemaVersion: 1;
  judgeVersion: typeof ACTION_QUALITY_JUDGE_VERSION;
  judgeRunId: string;
  sourceRunId: string;
  candidateId: string;
  stateId: string;
  condition: ActionQualityCondition;
  candidateStatus: "action" | "needs_evidence";
  candidateAction?: string;
  executionStatus: "completed" | "error";
  attemptCount: 1 | 2;
  score?: number;
  criticalError?: boolean;
  confidence?: number;
  reason?: string;
  evidenceReferences?: string[];
  errorCategory?: LlmTransportErrorCategory | "invalid_output";
}

type JudgeRecordBase = Pick<
  JudgeRecord,
  | "schemaVersion"
  | "judgeVersion"
  | "judgeRunId"
  | "sourceRunId"
  | "candidateId"
  | "stateId"
  | "condition"
  | "candidateStatus"
  | "candidateAction"
  | "attemptCount"
>;

interface RawJudgeAssessment {
  score?: unknown;
  critical_error?: unknown;
  confidence?: unknown;
  reason?: unknown;
  evidence_reference_ids?: unknown;
}

export interface JudgeCompleter {
  completeJson<T>(request: { system: string; prompt: string; timeoutMs?: number }): Promise<T | undefined>;
}

export interface JudgeRunProgress {
  completed: number;
  total: number;
  record: JudgeRecord;
}

export interface JudgeRunOptions {
  minCandidateIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  onProgress?: (progress: JudgeRunProgress) => void;
}

interface JsonTransport {
  completeJson<T>(config: LLMConfig, request: { system?: string; prompt: string; timeoutMs?: number }): Promise<T>;
}

export function judgeConfigFromEnvironment(env: NodeJS.ProcessEnv): LLMConfig {
  const config = {
    apiUrl: env.CELLMATE_EVAL_JUDGE_API_URL?.trim() ?? "",
    apiKey: env.CELLMATE_EVAL_JUDGE_API_KEY ?? "",
    modelName: env.CELLMATE_EVAL_JUDGE_MODEL?.trim() ?? ""
  };
  if (!hasUsableLLMConfig(config)) {
    throw new LlmTransportError(
      "configuration",
      "CELLMATE_EVAL_JUDGE_API_URL and CELLMATE_EVAL_JUDGE_MODEL are required.",
      false
    );
  }
  return config;
}

export function judgeConfigurationFingerprint(config: LLMConfig): string {
  return sha256(JSON.stringify({
    apiUrl: config.apiUrl,
    modelName: config.modelName,
    apiKeyConfigured: Boolean(config.apiKey)
  }));
}

export function createProductionJudgeCompleter(
  config: LLMConfig,
  transport: JsonTransport = new LlmTransport()
): JudgeCompleter {
  return {
    completeJson: <T>(request: { system: string; prompt: string; timeoutMs?: number }): Promise<T | undefined> =>
      transport.completeJson<T>(config, request)
  };
}

export function buildBlindedJudgeCandidates(
  states: FormalActionQualityState[],
  runRecords: ActionQualityRunRecord[],
  seed: string
): BlindedJudgeCandidate[] {
  if (!/^\d+$/.test(seed)) throw new Error("Judge seed must be a non-negative integer string.");
  const stateById = new Map(states.map((state) => [state.state_id, state]));
  if (stateById.size !== states.length) throw new Error("State pack contains duplicate state IDs.");
  const expectedIdentities = new Set(
    states.flatMap((state) => CONDITIONS.map((condition) => `${state.state_id}|${condition}`))
  );
  if (runRecords.length !== expectedIdentities.size) {
    throw new Error(`Source run must contain exactly ${expectedIdentities.size} state-condition records.`);
  }
  const allIdentities = new Set<string>();
  const sourceRunIds = new Set<string>();
  for (const record of runRecords) {
    const identity = `${record.stateId}|${record.condition}`;
    if (!expectedIdentities.has(identity)) throw new Error(`Unexpected source run record: ${identity}`);
    if (allIdentities.has(identity)) throw new Error(`Duplicate source run record: ${identity}`);
    allIdentities.add(identity);
    sourceRunIds.add(record.runId);
  }
  if (sourceRunIds.size !== 1) throw new Error("Source run records must share one run ID.");
  const completed = runRecords.filter((record) => record.executionStatus === "completed");
  const candidates = completed.map((record) => {
    const identity = `${record.stateId}|${record.condition}`;
    const state = stateById.get(record.stateId);
    if (!state) throw new Error(`Run record references an unknown state: ${record.stateId}`);
    if (!record.trace) throw new Error(`Completed run record lacks a decision trace: ${identity}`);
    return {
      candidateId: "",
      sourceRunId: record.runId,
      stateId: record.stateId,
      condition: record.condition,
      candidateStatus: record.trace.status,
      candidateAction: record.trace.status === "action" ? record.trace.action : undefined,
      state
    } satisfies BlindedJudgeCandidate;
  });

  return candidates
    .sort((left, right) => candidateOrderKey(seed, left).localeCompare(candidateOrderKey(seed, right)))
    .map((candidate, index) => ({
      ...candidate,
      candidateId: `candidate-${String(index + 1).padStart(4, "0")}`
    }));
}

export function buildStateEvidenceCatalog(state: FormalActionQualityState): StateEvidenceCatalogEntry[] {
  const entries: StateEvidenceCatalogEntry[] = [
    { id: "task:summary", value: state.task.task_summary },
    { id: "task:expected", value: state.task.expected_behavior },
    { id: "code:current", value: state.student_code },
    { id: "check:status", value: state.evidence.status },
    { id: "check:summary", value: state.evidence.summary },
    { id: "check:coverage", value: JSON.stringify(state.evidence.test_coverage) }
  ];
  for (const [concept, mastery] of Object.entries(state.learner_before.concepts)) {
    entries.push({ id: `learner:${encodeURIComponent(concept)}`, value: JSON.stringify(mastery) });
  }
  for (const entry of state.history) {
    entries.push({ id: `history:${entry.attempt_index}`, value: JSON.stringify(entry) });
  }
  if (state.course_context) entries.push({ id: "course:context", value: JSON.stringify(state.course_context) });
  return entries;
}

export function buildBlindedJudgePrompt(candidate: BlindedJudgeCandidate): { system: string; prompt: string } {
  const state = candidate.state;
  const blindedState = {
    state_id: state.state_id,
    stratum: state.stratum,
    source_mode: state.source_mode,
    task: state.task,
    student_code: state.student_code,
    evidence: state.evidence,
    learner_before: state.learner_before,
    history: state.history,
    course_context: state.course_context ?? null
  };
  const candidateDecision = {
    status: candidate.candidateStatus,
    ...(candidate.candidateStatus === "action" ? { action: candidate.candidateAction } : {})
  };
  const catalog = buildStateEvidenceCatalog(state);
  return {
    system:
      "You are an independent judge of one pedagogical next-step decision for a beginner Python learner. " +
      "Judge only the supplied blinded learner state and candidate decision. Do not infer which system produced it. " +
      "Return valid JSON only.",
    prompt: [
      `Judge version: ${ACTION_QUALITY_JUDGE_VERSION}`,
      `Candidate ID: ${candidate.candidateId}`,
      'Return schema: {"score":1|2|3|4|5,"critical_error":boolean,"confidence":1|2|3|4|5,"reason":string,"evidence_reference_ids":string[]}.',
      "Use 1-5 unique evidence_reference_ids copied exactly from the state evidence catalog.",
      "The reason must be concise and grounded only in those references.",
      "Score 5: best or essentially best next action for this state.",
      "Score 4: clearly appropriate, with only a minor alternative preference.",
      "Score 3: permissible but meaningfully suboptimal, repetitive, or early.",
      "Score 2: major educational weakness without a direct critical contradiction.",
      "Score 1: critical contradiction of evidence/progression or an unusable decision.",
      "critical_error must be true exactly when score is 1.",
      "Insufficient evidence requires needs_evidence, not a teaching action.",
      "Sufficient evidence requires an action, not needs_evidence.",
      "Failed evidence must not receive HARDER or NEXT_CONCEPT.",
      "Passed evidence must not receive HINT, RETRY_WITH_SCAFFOLD, or EASIER.",
      "NEXT_CONCEPT requires a recorded next course concept.",
      "Consider whether prior support failed, whether current positive coverage is narrow, and whether mastery/history justify progression.",
      `Blinded state: ${JSON.stringify(blindedState)}`,
      `Candidate decision: ${JSON.stringify(candidateDecision)}`,
      `State evidence catalog: ${JSON.stringify(catalog)}`
    ].join("\n")
  };
}

export async function judgeCandidate(
  candidate: BlindedJudgeCandidate,
  judgeRunId: string,
  completer: JudgeCompleter
): Promise<JudgeRecord> {
  const request = buildBlindedJudgePrompt(candidate);
  const first = await requestAssessment(completer, request.system, request.prompt);
  if (first.transportError && first.transportError !== "invalid_json") {
    return failedRecord(candidate, judgeRunId, 1, first.transportError);
  }
  const firstAssessment = first.raw ? normaliseJudgeAssessment(first.raw, candidate.state) : undefined;
  if (firstAssessment) return completedRecord(candidate, judgeRunId, 1, firstAssessment);

  const repaired = await requestAssessment(
    completer,
    `${request.system} Your previous response was rejected as invalid, ungrounded, or contradictory.`,
    `${request.prompt}\nThe previous response was rejected. Return one corrected JSON object that obeys every constraint.`
  );
  if (repaired.transportError && repaired.transportError !== "invalid_json") {
    return failedRecord(candidate, judgeRunId, 2, repaired.transportError);
  }
  const repairedAssessment = repaired.raw ? normaliseJudgeAssessment(repaired.raw, candidate.state) : undefined;
  return repairedAssessment
    ? completedRecord(candidate, judgeRunId, 2, repairedAssessment)
    : failedRecord(candidate, judgeRunId, 2, "invalid_output");
}

export async function runBlindedJudge(
  candidates: BlindedJudgeCandidate[],
  judgeRunId: string,
  completer: JudgeCompleter,
  options: JudgeRunOptions = {}
): Promise<JudgeRecord[]> {
  const minCandidateIntervalMs = normaliseNonNegativeInteger(options.minCandidateIntervalMs ?? 0);
  const sleep = options.sleep ?? ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? Date.now;
  const records: JudgeRecord[] = [];
  let previousStartedAt: number | undefined;
  for (const candidate of candidates) {
    if (previousStartedAt !== undefined && minCandidateIntervalMs > 0) {
      const remaining = minCandidateIntervalMs - (now() - previousStartedAt);
      if (remaining > 0) await sleep(remaining);
    }
    previousStartedAt = now();
    const record = await judgeCandidate(candidate, judgeRunId, completer);
    records.push(record);
    options.onProgress?.({ completed: records.length, total: candidates.length, record });
  }
  return records;
}

export function buildJudgeManifest(input: {
  judgeRunId: string;
  sourceRunId: string;
  seed: string;
  recordsText: string;
  records: JudgeRecord[];
  sourceRecordsSha256: string;
  sourceManifestSha256: string;
  statePackSha256: string;
  selectorModelVersion: string;
  judgeModelVersion: string;
  judgeConfigurationFingerprint: string;
  minCandidateIntervalMs: number;
  sourceCommit: string;
  sourceDirty: boolean;
  createdAt: string;
}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    judgeVersion: ACTION_QUALITY_JUDGE_VERSION,
    judgeRunId: input.judgeRunId,
    sourceRunId: input.sourceRunId,
    seed: input.seed,
    sourceRecordsSha256: input.sourceRecordsSha256,
    sourceManifestSha256: input.sourceManifestSha256,
    statePackSha256: input.statePackSha256,
    selectorModelVersion: input.selectorModelVersion,
    judgeModelVersion: input.judgeModelVersion,
    selectorJudgeModelNameIdentical: input.selectorModelVersion === input.judgeModelVersion,
    judgeConfigurationFingerprint: input.judgeConfigurationFingerprint,
    minCandidateIntervalMs: input.minCandidateIntervalMs,
    sourceCommit: input.sourceCommit,
    sourceDirty: input.sourceDirty,
    candidateCount: input.records.length,
    completedCount: input.records.filter((record) => record.executionStatus === "completed").length,
    errorCount: input.records.filter((record) => record.executionStatus === "error").length,
    repairedCount: input.records.filter((record) => record.attemptCount === 2).length,
    recordsSha256: sha256(input.recordsText),
    apiKeyRecorded: false,
    rawProviderResponsesRecorded: false,
    createdAt: input.createdAt
  };
}

function normaliseJudgeAssessment(
  raw: RawJudgeAssessment,
  state: FormalActionQualityState
): ValidJudgeAssessment | undefined {
  if (!Number.isInteger(raw.score) || (raw.score as number) < 1 || (raw.score as number) > 5) return undefined;
  if (typeof raw.critical_error !== "boolean") return undefined;
  if (((raw.score as number) === 1) !== raw.critical_error) return undefined;
  if (!Number.isInteger(raw.confidence) || (raw.confidence as number) < 1 || (raw.confidence as number) > 5) return undefined;
  if (typeof raw.reason !== "string" || !raw.reason.trim()) return undefined;
  if (!Array.isArray(raw.evidence_reference_ids)
    || raw.evidence_reference_ids.length < 1
    || raw.evidence_reference_ids.length > 5
    || raw.evidence_reference_ids.some((value) => typeof value !== "string" || value !== value.trim() || /[\r\n]/.test(value))) {
    return undefined;
  }
  const references = raw.evidence_reference_ids as string[];
  if (new Set(references).size !== references.length) return undefined;
  const allowed = new Set(buildStateEvidenceCatalog(state).map((entry) => entry.id));
  if (references.some((reference) => !allowed.has(reference))) return undefined;
  return {
    score: raw.score as number,
    criticalError: raw.critical_error,
    confidence: raw.confidence as number,
    reason: raw.reason.trim().replace(/\s+/g, " ").slice(0, 1000),
    evidenceReferences: references
  };
}

async function requestAssessment(
  completer: JudgeCompleter,
  system: string,
  prompt: string
): Promise<{ raw?: RawJudgeAssessment; transportError?: LlmTransportErrorCategory }> {
  try {
    const raw = await completer.completeJson<RawJudgeAssessment>({ system, prompt, timeoutMs: 15000 });
    return { raw };
  } catch (error) {
    return { transportError: error instanceof LlmTransportError ? error.category : "unknown" };
  }
}

function completedRecord(
  candidate: BlindedJudgeCandidate,
  judgeRunId: string,
  attemptCount: 1 | 2,
  assessment: ValidJudgeAssessment
): JudgeRecord {
  return {
    ...recordBase(candidate, judgeRunId, attemptCount),
    executionStatus: "completed",
    ...assessment
  };
}

function failedRecord(
  candidate: BlindedJudgeCandidate,
  judgeRunId: string,
  attemptCount: 1 | 2,
  errorCategory: JudgeRecord["errorCategory"]
): JudgeRecord {
  return {
    ...recordBase(candidate, judgeRunId, attemptCount),
    executionStatus: "error",
    errorCategory
  };
}

function recordBase(
  candidate: BlindedJudgeCandidate,
  judgeRunId: string,
  attemptCount: 1 | 2
): JudgeRecordBase {
  return {
    schemaVersion: ACTION_QUALITY_JUDGE_SCHEMA_VERSION as 1,
    judgeVersion: ACTION_QUALITY_JUDGE_VERSION,
    judgeRunId,
    sourceRunId: candidate.sourceRunId,
    candidateId: candidate.candidateId,
    stateId: candidate.stateId,
    condition: candidate.condition,
    candidateStatus: candidate.candidateStatus,
    candidateAction: candidate.candidateAction,
    attemptCount
  };
}

function candidateOrderKey(seed: string, candidate: Omit<BlindedJudgeCandidate, "candidateId">): string {
  return sha256(`${seed}|${candidate.sourceRunId}|${candidate.stateId}|${candidate.condition}`);
}

function parseJsonLines<T>(content: string, label: string): T[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line) as T;
    } catch (error) {
      throw new Error(`Invalid JSON in ${label} line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

async function main(): Promise<void> {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const sourceRunId = requiredArgument("--source-run-id");
  const judgeRunId = requiredArgument("--judge-run-id");
  const minCandidateIntervalMs = nonNegativeIntegerArgument("--min-candidate-interval-ms", 0);
  for (const [name, value] of [["--source-run-id", sourceRunId], ["--judge-run-id", judgeRunId]]) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) throw new Error(`${name} contains unsupported characters.`);
  }
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: pluginRoot, encoding: "utf8" });
  if (status.trim() && !process.argv.includes("--allow-dirty")) {
    throw new Error("Refusing a formal judge run from a dirty tree. Use a clean worktree or pass --allow-dirty explicitly.");
  }
  const resultsDir = path.join(pluginRoot, "evaluation", "results");
  const sourceRecordsPath = path.join(resultsDir, `${sourceRunId}.records.jsonl`);
  const sourceManifestPath = path.join(resultsDir, `${sourceRunId}.manifest.json`);
  const recordsPath = path.join(resultsDir, `${judgeRunId}.judge.records.jsonl`);
  const manifestPath = path.join(resultsDir, `${judgeRunId}.judge.manifest.json`);
  await assertAbsent(recordsPath);
  await assertAbsent(manifestPath);

  const sourceRecordsText = await fs.readFile(sourceRecordsPath, "utf8");
  const sourceManifestText = await fs.readFile(sourceManifestPath, "utf8");
  const sourceManifest = JSON.parse(sourceManifestText) as Record<string, unknown>;
  if (sha256(sourceRecordsText) !== sourceManifest.recordsSha256) throw new Error("Source run record hash does not match its manifest.");
  const runRecords = parseJsonLines<ActionQualityRunRecord>(sourceRecordsText, "source run records");
  const builder = require(path.join(pluginRoot, "evaluation", "annotation", "buildActionQualityStatePackV2.js")) as {
    verifyCommittedPack(): { states: FormalActionQualityState[]; manifest: Record<string, unknown> };
  };
  const { states, manifest: stateManifest } = builder.verifyCommittedPack();
  if (sourceManifest.statePackSha256 !== stateManifest.sha256) throw new Error("Source run used a different state pack.");
  const seed = String(sourceManifest.seed ?? "");
  const candidates = buildBlindedJudgeCandidates(states, runRecords, seed);
  const config = judgeConfigFromEnvironment(process.env);
  const fingerprint = judgeConfigurationFingerprint(config);
  let progressErrorCount = 0;
  const records = await runBlindedJudge(candidates, judgeRunId, createProductionJudgeCompleter(config), {
    minCandidateIntervalMs,
    onProgress: ({ completed, total, record }) => {
      if (record.executionStatus === "error") progressErrorCount += 1;
      if (completed % 10 === 0 || completed === total) {
        process.stdout.write(`judge_progress=${completed}/${total} errors=${progressErrorCount}\n`);
      }
    }
  });
  const recordsText = `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
  const createdAt = new Date().toISOString();
  const judgeManifest = buildJudgeManifest({
    judgeRunId,
    sourceRunId,
    seed,
    recordsText,
    records,
    sourceRecordsSha256: String(sourceManifest.recordsSha256),
    sourceManifestSha256: sha256(sourceManifestText),
    statePackSha256: String(stateManifest.sha256),
    selectorModelVersion: String(sourceManifest.selectorModelVersion),
    judgeModelVersion: config.modelName,
    judgeConfigurationFingerprint: fingerprint,
    minCandidateIntervalMs,
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: pluginRoot, encoding: "utf8" }).trim(),
    sourceDirty: Boolean(status.trim()),
    createdAt
  });
  await fs.writeFile(recordsPath, recordsText, { encoding: "utf8", flag: "wx" });
  await fs.writeFile(manifestPath, `${JSON.stringify(judgeManifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`judge_run=${judgeRunId} candidates=${records.length} errors=${records.filter((record) => record.executionStatus === "error").length}\n`);
}

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`${name} is required.`);
  return value;
}

function nonNegativeIntegerArgument(name: string, fallback: number): number {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a non-negative integer.`);
  return Number(value);
}

function normaliseNonNegativeInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("minCandidateIntervalMs must be a non-negative integer.");
  return value;
}

const CONDITIONS: ActionQualityCondition[] = [
  "fixed-v2",
  "full-adaptive-v1",
  "llm-next-step-v6",
  "no-history-v1"
];

async function assertAbsent(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
    throw new Error(`Refusing to overwrite existing locked artifact: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
