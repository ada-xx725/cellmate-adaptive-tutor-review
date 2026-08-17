import { execFileSync } from "child_process";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import { JudgeRecord } from "./actionQualityJudge";
import { ActionQualityCondition, ActionQualityRunRecord } from "./actionQualityRunner";

export const ACTION_QUALITY_STATISTICS_VERSION = "action-quality-statistics-v1";
const Z_95 = 1.959963984540054;
const PRIMARY_CONDITIONS: ActionQualityCondition[] = ["fixed-v2", "full-adaptive-v1", "llm-next-step-v6"];
const ALL_CONDITIONS: ActionQualityCondition[] = [...PRIMARY_CONDITIONS, "no-history-v1"];

export interface RateSummary {
  numerator: number;
  denominator: number;
  rate: number | null;
  ci95: [number, number] | null;
}

export interface ScoreSummary {
  count: number;
  mean: number | null;
  sampleStandardDeviation: number | null;
  ci95: [number, number] | null;
}

export interface ConditionStatistics {
  condition: ActionQualityCondition;
  role: "primary" | "secondary_ablation";
  runCount: number;
  executionCompletion: RateSummary;
  judgeScore: ScoreSummary;
  hardConstraintViolation: RateSummary;
  needsEvidenceAccuracy: RateSummary;
  judgeCriticalError: RateSummary;
  judgeCompletionCoverage: RateSummary;
  invarianceStability: RateSummary;
  selectorFallback?: RateSummary;
}

export interface PairedDifferenceSummary {
  leftCondition: ActionQualityCondition;
  rightCondition: ActionQualityCondition;
  estimand: "right_minus_left_mean_judge_score";
  pairedStateCount: number;
  meanDifference: number | null;
  ci95: [number, number] | null;
  seed: string;
  resamples: number;
}

export interface ActionQualityStatistics {
  statisticsVersion: typeof ACTION_QUALITY_STATISTICS_VERSION;
  suiteVersion: string;
  statePackVersion: string;
  constructedStateCount: number;
  seed: string;
  bootstrapResamples: number;
  primaryConditions: ActionQualityCondition[];
  secondaryAblations: ActionQualityCondition[];
  conditions: ConditionStatistics[];
  pairedDifferences: PairedDifferenceSummary[];
  interpretationBoundary: string;
}

interface InvarianceGroup {
  groupId: string;
  stateIds: string[];
  relation: string;
}

interface StatePackManifest {
  statePackVersion: string;
  stateCount: number;
  invarianceGroups: InvarianceGroup[];
}

export function summarizeActionQuality(input: {
  runRecords: ActionQualityRunRecord[];
  judgeRecords: JudgeRecord[];
  stateManifest: StatePackManifest;
  seed: string;
  resamples: number;
}): ActionQualityStatistics {
  if (!/^\d+$/.test(input.seed)) throw new Error("Statistics seed must be a non-negative integer string.");
  if (!Number.isInteger(input.resamples) || input.resamples < 1) throw new Error("Bootstrap resamples must be a positive integer.");
  validateArtifacts(input.runRecords, input.judgeRecords, input.stateManifest);
  const judgeByIdentity = new Map(input.judgeRecords.map((record) => [identity(record.stateId, record.condition), record]));
  const runByIdentity = new Map(input.runRecords.map((record) => [identity(record.stateId, record.condition), record]));

  const conditions = ALL_CONDITIONS.map((condition): ConditionStatistics => {
    const runs = input.runRecords.filter((record) => record.condition === condition);
    const completedRuns = runs.filter((record) => record.executionStatus === "completed");
    const judges = input.judgeRecords.filter((record) => record.condition === condition);
    const completedJudges = judges.filter((record) => record.executionStatus === "completed");
    const scores = completedJudges.map((record) => record.score as number);
    const stability = invarianceStability(condition, input.stateManifest.invarianceGroups, runByIdentity);
    const summary: ConditionStatistics = {
      condition,
      role: PRIMARY_CONDITIONS.includes(condition) ? "primary" : "secondary_ablation",
      runCount: runs.length,
      executionCompletion: rateSummary(completedRuns.length, runs.length),
      judgeScore: scoreSummary(scores),
      hardConstraintViolation: rateSummary(
        completedRuns.filter((record) => record.hardConstraintViolations.length > 0).length,
        completedRuns.length
      ),
      needsEvidenceAccuracy: rateSummary(
        runs.filter((record) => record.needsEvidenceCorrect === true).length,
        runs.length
      ),
      judgeCriticalError: rateSummary(
        completedJudges.filter((record) => record.criticalError === true).length,
        completedJudges.length
      ),
      judgeCompletionCoverage: rateSummary(completedJudges.length, runs.length),
      invarianceStability: stability
    };
    if (condition === "llm-next-step-v6") {
      const eligible = runs.filter((record) => !record.needsEvidenceExpected);
      summary.selectorFallback = rateSummary(
        eligible.filter((record) => record.trace?.fallbackUsed === true).length,
        eligible.length
      );
    }
    return summary;
  });

  const pairedDifferences = [
    pairedDifference("fixed-v2", "full-adaptive-v1", judgeByIdentity, input.seed, input.resamples),
    pairedDifference("fixed-v2", "llm-next-step-v6", judgeByIdentity, input.seed, input.resamples),
    pairedDifference("full-adaptive-v1", "llm-next-step-v6", judgeByIdentity, input.seed, input.resamples)
  ];

  return {
    statisticsVersion: ACTION_QUALITY_STATISTICS_VERSION,
    suiteVersion: input.runRecords[0].suiteVersion,
    statePackVersion: input.stateManifest.statePackVersion,
    constructedStateCount: input.stateManifest.stateCount,
    seed: input.seed,
    bootstrapResamples: input.resamples,
    primaryConditions: [...PRIMARY_CONDITIONS],
    secondaryAblations: ["no-history-v1"],
    conditions,
    pairedDifferences,
    interpretationBoundary:
      "These statistics describe performance on the constructed blinded state pack and are not estimates of real-student learning gains."
  };
}

export function rateSummary(numerator: number, denominator: number): RateSummary {
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)
    || numerator < 0 || denominator < 0 || numerator > denominator) {
    throw new Error(`Invalid rate counts: ${numerator}/${denominator}`);
  }
  if (denominator === 0) return { numerator, denominator, rate: null, ci95: null };
  const rate = numerator / denominator;
  const z2 = Z_95 * Z_95;
  const adjusted = 1 + z2 / denominator;
  const centre = (rate + z2 / (2 * denominator)) / adjusted;
  const margin = Z_95 * Math.sqrt((rate * (1 - rate) / denominator) + (z2 / (4 * denominator * denominator))) / adjusted;
  return {
    numerator,
    denominator,
    rate,
    ci95: [Math.max(0, centre - margin), Math.min(1, centre + margin)]
  };
}

export function scoreSummary(values: number[]): ScoreSummary {
  if (!values.length) return { count: 0, mean: null, sampleStandardDeviation: null, ci95: null };
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Score values must be finite.");
  const mean = average(values);
  const sampleStandardDeviation = values.length > 1
    ? Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / (values.length - 1))
    : 0;
  const margin = Z_95 * sampleStandardDeviation / Math.sqrt(values.length);
  return {
    count: values.length,
    mean,
    sampleStandardDeviation,
    ci95: [mean - margin, mean + margin]
  };
}

export function deterministicPairedBootstrap(
  differences: number[],
  seed: string,
  label: string,
  resamples: number
): [number, number] | null {
  if (!differences.length) return null;
  const estimates: number[] = [];
  for (let sample = 0; sample < resamples; sample += 1) {
    let total = 0;
    for (let draw = 0; draw < differences.length; draw += 1) {
      const random = deterministicUnit(seed, label, sample, draw);
      total += differences[Math.floor(random * differences.length)];
    }
    estimates.push(total / differences.length);
  }
  estimates.sort((left, right) => left - right);
  return [quantile(estimates, 0.025), quantile(estimates, 0.975)];
}

export function statisticsToCsv(statistics: ActionQualityStatistics): string {
  const header = [
    "condition",
    "role",
    "judge_n",
    "judge_mean",
    "judge_sd",
    "judge_ci95",
    "hard_violation_numerator",
    "hard_violation_denominator",
    "hard_violation_rate",
    "hard_violation_ci95",
    "needs_evidence_correct",
    "needs_evidence_denominator",
    "needs_evidence_rate",
    "needs_evidence_ci95",
    "critical_error_numerator",
    "critical_error_denominator",
    "critical_error_rate",
    "critical_error_ci95",
    "judge_completed",
    "judge_denominator",
    "judge_coverage_rate",
    "judge_coverage_ci95",
    "invariance_stable",
    "invariance_denominator",
    "invariance_rate",
    "invariance_ci95",
    "selector_fallback_numerator",
    "selector_fallback_denominator",
    "selector_fallback_rate",
    "selector_fallback_ci95"
  ];
  const rows = statistics.conditions.map((condition) => [
    condition.condition,
    condition.role,
    condition.judgeScore.count,
    numberCell(condition.judgeScore.mean),
    numberCell(condition.judgeScore.sampleStandardDeviation),
    intervalCell(condition.judgeScore.ci95),
    condition.hardConstraintViolation.numerator,
    condition.hardConstraintViolation.denominator,
    numberCell(condition.hardConstraintViolation.rate),
    intervalCell(condition.hardConstraintViolation.ci95),
    condition.needsEvidenceAccuracy.numerator,
    condition.needsEvidenceAccuracy.denominator,
    numberCell(condition.needsEvidenceAccuracy.rate),
    intervalCell(condition.needsEvidenceAccuracy.ci95),
    condition.judgeCriticalError.numerator,
    condition.judgeCriticalError.denominator,
    numberCell(condition.judgeCriticalError.rate),
    intervalCell(condition.judgeCriticalError.ci95),
    condition.judgeCompletionCoverage.numerator,
    condition.judgeCompletionCoverage.denominator,
    numberCell(condition.judgeCompletionCoverage.rate),
    intervalCell(condition.judgeCompletionCoverage.ci95),
    condition.invarianceStability.numerator,
    condition.invarianceStability.denominator,
    numberCell(condition.invarianceStability.rate),
    intervalCell(condition.invarianceStability.ci95),
    condition.selectorFallback?.numerator ?? "",
    condition.selectorFallback?.denominator ?? "",
    numberCell(condition.selectorFallback?.rate ?? null),
    intervalCell(condition.selectorFallback?.ci95 ?? null)
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

export function statisticsToMarkdown(statistics: ActionQualityStatistics): string {
  const lines = [
    `# Action-quality statistics (${statistics.statisticsVersion})`,
    "",
    statistics.interpretationBoundary,
    "",
    `Seed: \`${statistics.seed}\`; paired bootstrap resamples: ${statistics.bootstrapResamples}.`,
    "",
    "| Condition | Role | Judge n | Mean score (95% CI) | Hard violations | Needs-evidence accuracy | Critical errors | Judge coverage | Invariance stability | Fallback |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|"
  ];
  for (const condition of statistics.conditions) {
    lines.push(`| ${condition.condition} | ${condition.role} | ${condition.judgeScore.count} | ${formatScore(condition.judgeScore)} | ${formatRate(condition.hardConstraintViolation)} | ${formatRate(condition.needsEvidenceAccuracy)} | ${formatRate(condition.judgeCriticalError)} | ${formatRate(condition.judgeCompletionCoverage)} | ${formatRate(condition.invarianceStability)} | ${condition.selectorFallback ? formatRate(condition.selectorFallback) : "n/a"} |`);
  }
  lines.push("", "## Paired judge-score differences", "");
  for (const difference of statistics.pairedDifferences) {
    lines.push(`- ${difference.rightCondition} minus ${difference.leftCondition}: n=${difference.pairedStateCount}, mean=${formatNumber(difference.meanDifference)}, 95% bootstrap CI=${formatInterval(difference.ci95)}.`);
  }
  lines.push("");
  return lines.join("\n");
}

function validateArtifacts(
  runRecords: ActionQualityRunRecord[],
  judgeRecords: JudgeRecord[],
  stateManifest: StatePackManifest
): void {
  const expectedRunCount = stateManifest.stateCount * ALL_CONDITIONS.length;
  if (runRecords.length !== expectedRunCount) throw new Error(`Expected ${expectedRunCount} run records, received ${runRecords.length}.`);
  const runByIdentity = new Map<string, ActionQualityRunRecord>();
  for (const record of runRecords) {
    const key = identity(record.stateId, record.condition);
    if (runByIdentity.has(key)) throw new Error(`Duplicate run record: ${key}`);
    runByIdentity.set(key, record);
  }
  const completedRuns = runRecords.filter((record) => record.executionStatus === "completed");
  if (judgeRecords.length !== completedRuns.length) {
    throw new Error(`Expected ${completedRuns.length} judge records, received ${judgeRecords.length}.`);
  }
  const judgeIdentities = new Set<string>();
  for (const judge of judgeRecords) {
    const key = identity(judge.stateId, judge.condition);
    if (judgeIdentities.has(key)) throw new Error(`Duplicate judge record: ${key}`);
    judgeIdentities.add(key);
    const run = runByIdentity.get(key);
    if (!run || run.executionStatus !== "completed" || !run.trace) throw new Error(`Judge record lacks a completed source decision: ${key}`);
    if (judge.sourceRunId !== run.runId) throw new Error(`Judge/source run ID mismatch: ${key}`);
    const runAction = run.trace.status === "action" ? run.trace.action : undefined;
    if (judge.candidateStatus !== run.trace.status || judge.candidateAction !== runAction) {
      throw new Error(`Judge candidate does not match the locked source decision: ${key}`);
    }
    if (judge.executionStatus === "completed"
      && (!Number.isFinite(judge.score) || (judge.score as number) < 1 || (judge.score as number) > 5)) {
      throw new Error(`Completed judge record has an invalid score: ${key}`);
    }
  }
  for (const run of completedRuns) {
    if (!judgeIdentities.has(identity(run.stateId, run.condition))) {
      throw new Error(`Completed source decision lacks a judge record: ${identity(run.stateId, run.condition)}`);
    }
  }
}

function invarianceStability(
  condition: ActionQualityCondition,
  groups: InvarianceGroup[],
  runByIdentity: Map<string, ActionQualityRunRecord>
): RateSummary {
  let stable = 0;
  for (const group of groups) {
    const signatures = group.stateIds.map((stateId) => {
      const record = runByIdentity.get(identity(stateId, condition));
      if (!record || record.executionStatus !== "completed" || !record.trace) return "execution_error";
      return record.trace.status === "action" ? `action:${record.trace.action}` : "needs_evidence";
    });
    if (new Set(signatures).size === 1 && signatures[0] !== "execution_error") stable += 1;
  }
  return rateSummary(stable, groups.length);
}

function pairedDifference(
  leftCondition: ActionQualityCondition,
  rightCondition: ActionQualityCondition,
  judges: Map<string, JudgeRecord>,
  seed: string,
  resamples: number
): PairedDifferenceSummary {
  const stateIds = new Set(Array.from(judges.values()).map((record) => record.stateId));
  const differences: number[] = [];
  for (const stateId of stateIds) {
    const left = judges.get(identity(stateId, leftCondition));
    const right = judges.get(identity(stateId, rightCondition));
    if (left?.executionStatus === "completed" && right?.executionStatus === "completed") {
      differences.push((right.score as number) - (left.score as number));
    }
  }
  const label = `${rightCondition}-minus-${leftCondition}`;
  return {
    leftCondition,
    rightCondition,
    estimand: "right_minus_left_mean_judge_score",
    pairedStateCount: differences.length,
    meanDifference: differences.length ? average(differences) : null,
    ci95: deterministicPairedBootstrap(differences, seed, label, resamples),
    seed,
    resamples
  };
}

function deterministicUnit(seed: string, label: string, sample: number, draw: number): number {
  const bytes = createHash("sha256").update(`${seed}|${label}|${sample}|${draw}`).digest();
  return bytes.readUInt32BE(0) / 0x1_0000_0000;
}

function quantile(sorted: number[], probability: number): number {
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] + ((sorted[upper] - sorted[lower]) * fraction);
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function identity(stateId: string, condition: ActionQualityCondition): string {
  return `${stateId}|${condition}`;
}

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function numberCell(value: number | null): string | number {
  return value === null ? "" : value;
}

function intervalCell(value: [number, number] | null): string {
  return value ? `${value[0]}|${value[1]}` : "";
}

function formatNumber(value: number | null): string {
  return value === null ? "n/a" : value.toFixed(3);
}

function formatRate(value: RateSummary): string {
  return value.rate === null
    ? `n/a (${value.numerator}/${value.denominator})`
    : `${(value.rate * 100).toFixed(1)}% (${value.numerator}/${value.denominator}; 95% CI ${formatInterval(value.ci95)})`;
}

function formatScore(value: ScoreSummary): string {
  return value.mean === null ? "n/a" : `${formatNumber(value.mean)} ${formatInterval(value.ci95)}`;
}

function formatInterval(value: [number, number] | null): string {
  return value ? `[${value[0].toFixed(3)}, ${value[1].toFixed(3)}]` : "n/a";
}

async function main(): Promise<void> {
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const sourceRunId = requiredArgument("--source-run-id");
  const judgeRunId = requiredArgument("--judge-run-id");
  const summaryId = requiredArgument("--summary-id");
  for (const [name, value] of [["--source-run-id", sourceRunId], ["--judge-run-id", judgeRunId], ["--summary-id", summaryId]]) {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(value)) throw new Error(`${name} contains unsupported characters.`);
  }
  const resamplesText = argument("--resamples") ?? "10000";
  if (!/^\d+$/.test(resamplesText) || Number(resamplesText) < 1) throw new Error("--resamples must be a positive integer.");
  const resamples = Number(resamplesText);
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: pluginRoot, encoding: "utf8" });
  if (status.trim() && !process.argv.includes("--allow-dirty")) {
    throw new Error("Refusing formal statistics from a dirty tree. Use a clean worktree or pass --allow-dirty explicitly.");
  }

  const resultsDir = path.join(pluginRoot, "evaluation", "results");
  const sourceRecordsPath = path.join(resultsDir, `${sourceRunId}.records.jsonl`);
  const sourceManifestPath = path.join(resultsDir, `${sourceRunId}.manifest.json`);
  const judgeRecordsPath = path.join(resultsDir, `${judgeRunId}.judge.records.jsonl`);
  const judgeManifestPath = path.join(resultsDir, `${judgeRunId}.judge.manifest.json`);
  const outputJsonPath = path.join(resultsDir, `${summaryId}.statistics.json`);
  const outputCsvPath = path.join(resultsDir, `${summaryId}.statistics.csv`);
  const outputMarkdownPath = path.join(resultsDir, `${summaryId}.statistics.md`);
  const outputManifestPath = path.join(resultsDir, `${summaryId}.statistics.manifest.json`);
  for (const filePath of [outputJsonPath, outputCsvPath, outputMarkdownPath, outputManifestPath]) await assertAbsent(filePath);

  const [sourceRecordsText, sourceManifestText, judgeRecordsText, judgeManifestText] = await Promise.all([
    fs.readFile(sourceRecordsPath, "utf8"),
    fs.readFile(sourceManifestPath, "utf8"),
    fs.readFile(judgeRecordsPath, "utf8"),
    fs.readFile(judgeManifestPath, "utf8")
  ]);
  const sourceManifest = JSON.parse(sourceManifestText) as Record<string, unknown>;
  const judgeManifest = JSON.parse(judgeManifestText) as Record<string, unknown>;
  if (sha256(sourceRecordsText) !== sourceManifest.recordsSha256) throw new Error("Source run record hash mismatch.");
  if (sha256(judgeRecordsText) !== judgeManifest.recordsSha256) throw new Error("Judge record hash mismatch.");
  if (judgeManifest.sourceRecordsSha256 !== sourceManifest.recordsSha256) throw new Error("Judge manifest references a different source run.");
  if (judgeManifest.sourceManifestSha256 !== sha256(sourceManifestText)) throw new Error("Judge manifest source-run manifest hash mismatch.");
  if (sourceManifest.runId !== sourceRunId || judgeManifest.sourceRunId !== sourceRunId) throw new Error("Source run ID mismatch.");
  if (judgeManifest.judgeRunId !== judgeRunId) throw new Error("Judge run ID mismatch.");
  const builder = require(path.join(pluginRoot, "evaluation", "annotation", "buildActionQualityStatePackV2.js")) as {
    verifyCommittedPack(): { manifest: StatePackManifest };
  };
  const { manifest: stateManifest } = builder.verifyCommittedPack();
  if (stateManifest.statePackVersion !== sourceManifest.statePackVersion) throw new Error("Source run state-pack version mismatch.");
  const statistics = summarizeActionQuality({
    runRecords: parseJsonLines<ActionQualityRunRecord>(sourceRecordsText, "source run records"),
    judgeRecords: parseJsonLines<JudgeRecord>(judgeRecordsText, "judge records"),
    stateManifest,
    seed: String(sourceManifest.seed ?? ""),
    resamples
  });
  const jsonText = `${JSON.stringify(statistics, null, 2)}\n`;
  const csvText = statisticsToCsv(statistics);
  const markdownText = statisticsToMarkdown(statistics);
  const manifest = {
    schemaVersion: 1,
    statisticsVersion: ACTION_QUALITY_STATISTICS_VERSION,
    summaryId,
    sourceRunId,
    judgeRunId,
    sourceRecordsSha256: sha256(sourceRecordsText),
    sourceManifestSha256: sha256(sourceManifestText),
    judgeRecordsSha256: sha256(judgeRecordsText),
    judgeManifestSha256: sha256(judgeManifestText),
    statePackSha256: sourceManifest.statePackSha256,
    seed: statistics.seed,
    bootstrapResamples: statistics.bootstrapResamples,
    outputs: {
      jsonSha256: sha256(jsonText),
      csvSha256: sha256(csvText),
      markdownSha256: sha256(markdownText)
    },
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: pluginRoot, encoding: "utf8" }).trim(),
    sourceDirty: Boolean(status.trim()),
    createdAt: new Date().toISOString()
  };
  await fs.writeFile(outputJsonPath, jsonText, { encoding: "utf8", flag: "wx" });
  await fs.writeFile(outputCsvPath, csvText, { encoding: "utf8", flag: "wx" });
  await fs.writeFile(outputMarkdownPath, markdownText, { encoding: "utf8", flag: "wx" });
  await fs.writeFile(outputManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  process.stdout.write(`summary=${summaryId} states=${statistics.constructedStateCount} resamples=${resamples}\n`);
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

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredArgument(name: string): string {
  const value = argument(name);
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

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
