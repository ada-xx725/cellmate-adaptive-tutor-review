import { createHash } from "crypto";
import { promises as fs, readFileSync } from "fs";
import * as path from "path";
import {
  buildBlindedJudgeCandidates,
  buildJudgeManifest,
  createProductionJudgeCompleter,
  judgeConfigurationFingerprint,
  JudgeRecord,
  runBlindedJudge
} from "./actionQualityJudge";
import {
  ActionQualityRunRecord,
  buildActionQualityRunManifest,
  createProductionLlmEngine,
  FormalActionQualityState,
  runActionQualityStates,
  selectorConfigurationFingerprint
} from "./actionQualityRunner";
import {
  ActionQualityStatistics,
  statisticsToCsv,
  statisticsToMarkdown,
  summarizeActionQuality
} from "./actionQualityStatistics";
import {
  SimulatedLlmHttpClient,
  SimulatedProviderAudit
} from "./simulation/simulatedProviders";
import { LLMConfig } from "../src/llmConfiguration";
import { LlmTransport } from "../src/llmTransport";

export const SIMULATED_EVALUATION_VERSION = "action-quality-simulation-v1";
export const SIMULATED_EVALUATION_CREATED_AT = "2026-08-11T00:00:00.000Z";
export const SIMULATED_SELECTOR_MODEL = "cellmate-simulated-selector-v1";
export const SIMULATED_JUDGE_MODEL = "cellmate-simulated-judge-v1";

const SIMULATION_MARKERS = Object.freeze({
  simulated: true,
  developmentOnly: true,
  formalEvidence: false
});
const SIMULATION_DISCLAIMER =
  "Deterministic pipeline rehearsal only. These outputs are not formal model evidence and do not estimate learner outcomes.";
const SELECTOR_CONFIG: LLMConfig = {
  apiUrl: "https://simulation.invalid/v1",
  apiKey: "",
  modelName: SIMULATED_SELECTOR_MODEL
};
const JUDGE_CONFIG: LLMConfig = {
  apiUrl: "https://simulation.invalid/v1",
  apiKey: "",
  modelName: SIMULATED_JUDGE_MODEL
};

interface InvarianceGroup {
  groupId: string;
  stateIds: string[];
  relation: string;
}

interface StatePackManifest {
  statePackVersion: string;
  protocolVersion: string;
  stateCount: number;
  sha256: string;
  invarianceGroups: InvarianceGroup[];
  [key: string]: unknown;
}

export interface SimulatedEvaluationOptions {
  simulationId: string;
  seed: string;
  resamples: number;
  pluginRoot?: string;
}

export interface SimulatedEvaluationCliArguments {
  simulationId: string;
  seed: string;
  resamples: number;
  check: boolean;
}

export interface SimulatedEvaluationArtifact {
  fileName: string;
  text: string;
  sha256: string;
}

export interface SimulatedActionQualityBundle {
  simulationId: string;
  seed: string;
  resamples: number;
  runRecords: ActionQualityRunRecord[];
  judgeRecords: JudgeRecord[];
  statistics: ActionQualityStatistics;
  selectorAudit: SimulatedProviderAudit;
  judgeAudit: SimulatedProviderAudit;
  simulationManifest: Record<string, unknown>;
  artifacts: SimulatedEvaluationArtifact[];
}

export async function buildSimulatedActionQualityEvaluation(
  options: SimulatedEvaluationOptions
): Promise<SimulatedActionQualityBundle> {
  validateOptions(options);
  const pluginRoot = path.resolve(options.pluginRoot ?? path.resolve(__dirname, "..", ".."));
  const protocolManifest = verifyProtocolFreeze(pluginRoot);
  const builder = require(path.join(pluginRoot, "evaluation", "annotation", "buildActionQualityStatePackV2.js")) as {
    verifyCommittedPack(): { states: FormalActionQualityState[]; manifest: StatePackManifest };
  };
  const { states, manifest: stateManifest } = builder.verifyCommittedPack();

  const selectorClient = new SimulatedLlmHttpClient({ role: "selector" });
  let clockTick = BigInt(0);
  const runRecords = await runActionQualityStates(states, {
    runId: `${options.simulationId}-run`,
    selectorModelVersion: SELECTOR_CONFIG.modelName,
    selectorConfigurationFingerprint: selectorConfigurationFingerprint(SELECTOR_CONFIG),
    llmEngine: createProductionLlmEngine(SELECTOR_CONFIG, new LlmTransport(selectorClient)),
    createdAt: SIMULATED_EVALUATION_CREATED_AT,
    clock: () => {
      clockTick += BigInt(1_000_000);
      return clockTick;
    }
  });
  const runRecordsText = simulationJsonLines(runRecords);
  const runManifest = {
    ...SIMULATION_MARKERS,
    artifactKind: "simulated_action_quality_run",
    disclaimer: SIMULATION_DISCLAIMER,
    ...buildActionQualityRunManifest({
      runId: `${options.simulationId}-run`,
      seed: options.seed,
      recordsText: runRecordsText,
      records: runRecords,
      stateManifest,
      protocolManifest,
      selectorModelVersion: SELECTOR_CONFIG.modelName,
      selectorConfigurationFingerprint: selectorConfigurationFingerprint(SELECTOR_CONFIG),
      sourceCommit: "SIMULATED-DEVELOPMENT-ONLY",
      sourceDirty: true,
      sourceStatusSha256: sha256("simulated development-only source identity"),
      createdAt: SIMULATED_EVALUATION_CREATED_AT
    })
  };
  const runManifestText = prettyJson(runManifest);

  const candidates = buildBlindedJudgeCandidates(states, runRecords, options.seed);
  const judgeClient = new SimulatedLlmHttpClient({ role: "judge" });
  const judgeRecords = await runBlindedJudge(
    candidates,
    `${options.simulationId}-judge`,
    createProductionJudgeCompleter(JUDGE_CONFIG, new LlmTransport(judgeClient))
  );
  const judgeRecordsText = simulationJsonLines(judgeRecords);
  const judgeManifest = {
    ...SIMULATION_MARKERS,
    artifactKind: "simulated_action_quality_judge",
    disclaimer: SIMULATION_DISCLAIMER,
    ...buildJudgeManifest({
      judgeRunId: `${options.simulationId}-judge`,
      sourceRunId: `${options.simulationId}-run`,
      seed: options.seed,
      recordsText: judgeRecordsText,
      records: judgeRecords,
      sourceRecordsSha256: sha256(runRecordsText),
      sourceManifestSha256: sha256(runManifestText),
      statePackSha256: stateManifest.sha256,
      selectorModelVersion: SELECTOR_CONFIG.modelName,
      judgeModelVersion: JUDGE_CONFIG.modelName,
      judgeConfigurationFingerprint: judgeConfigurationFingerprint(JUDGE_CONFIG),
      minCandidateIntervalMs: 0,
      sourceCommit: "SIMULATED-DEVELOPMENT-ONLY",
      sourceDirty: true,
      createdAt: SIMULATED_EVALUATION_CREATED_AT
    })
  };
  const judgeManifestText = prettyJson(judgeManifest);

  const statistics = summarizeActionQuality({
    runRecords,
    judgeRecords,
    stateManifest,
    seed: options.seed,
    resamples: options.resamples
  });
  const statisticsJsonText = prettyJson({
    ...SIMULATION_MARKERS,
    artifactKind: "simulated_action_quality_statistics",
    disclaimer: SIMULATION_DISCLAIMER,
    statistics
  });
  const statisticsCsvText = [
    "# simulated=true",
    "# developmentOnly=true",
    "# formalEvidence=false",
    `# disclaimer=${SIMULATION_DISCLAIMER}`,
    statisticsToCsv(statistics).trimEnd(),
    ""
  ].join("\n");
  const statisticsMarkdownText = [
    "# SIMULATED DEVELOPMENT OUTPUT — NOT FORMAL EVIDENCE",
    "",
    SIMULATION_DISCLAIMER,
    "",
    statisticsToMarkdown(statistics).trimEnd(),
    ""
  ].join("\n");

  const selectorAudit = selectorClient.getAudit();
  const judgeAudit = judgeClient.getAudit();
  const providerAuditText = prettyJson({
    ...SIMULATION_MARKERS,
    artifactKind: "simulated_provider_audit",
    disclaimer: SIMULATION_DISCLAIMER,
    selector: selectorAudit,
    judge: judgeAudit
  });
  const lockedArtifacts = [
    artifact("run.records.jsonl", runRecordsText),
    artifact("run.manifest.json", runManifestText),
    artifact("judge.records.jsonl", judgeRecordsText),
    artifact("judge.manifest.json", judgeManifestText),
    artifact("statistics.json", statisticsJsonText),
    artifact("statistics.csv", statisticsCsvText),
    artifact("statistics.md", statisticsMarkdownText),
    artifact("provider-audit.json", providerAuditText)
  ];
  const simulationManifest: Record<string, unknown> = {
    ...SIMULATION_MARKERS,
    schemaVersion: 1,
    simulationVersion: SIMULATED_EVALUATION_VERSION,
    simulationId: options.simulationId,
    disclaimer: SIMULATION_DISCLAIMER,
    deterministicCreatedAt: SIMULATED_EVALUATION_CREATED_AT,
    seed: options.seed,
    bootstrapResamples: options.resamples,
    statePackVersion: stateManifest.statePackVersion,
    statePackSha256: stateManifest.sha256,
    protocolVersion: protocolManifest.protocolVersion,
    selectorPromptVersion: protocolManifest.selectorPromptVersion,
    judgePromptVersion: protocolManifest.judgePromptVersion,
    statisticsVersion: protocolManifest.statisticsVersion,
    selectorModelVersion: SELECTOR_CONFIG.modelName,
    judgeModelVersion: JUDGE_CONFIG.modelName,
    credentialsConfigured: false,
    networkCalls: 0,
    rawPromptsRecorded: false,
    rawResponsesRecorded: false,
    counts: simulationCounts(runRecords, judgeRecords, selectorAudit, judgeAudit),
    artifactLock: {
      directoryIsWriteOnce: true,
      checkModeIsReadOnly: true,
      lockedArtifactCount: lockedArtifacts.length + 1,
      hashedArtifactCount: lockedArtifacts.length,
      manifestSelfHashExcluded: true
    },
    artifacts: Object.fromEntries(
      lockedArtifacts.map((item) => [item.fileName, { sha256: item.sha256, bytes: Buffer.byteLength(item.text, "utf8") }])
    ),
    sourceProvenance:
      "Git commit and dirty-tree identity are deliberately not used for deterministic simulation artifacts; formal runs retain their separate provenance requirements."
  };
  const artifacts = [
    ...lockedArtifacts,
    artifact("simulation.manifest.json", prettyJson(simulationManifest))
  ];
  return {
    simulationId: options.simulationId,
    seed: options.seed,
    resamples: options.resamples,
    runRecords,
    judgeRecords,
    statistics,
    selectorAudit,
    judgeAudit,
    simulationManifest,
    artifacts
  };
}

export async function writeSimulatedEvaluationArtifacts(
  bundle: SimulatedActionQualityBundle,
  outputRoot: string
): Promise<string> {
  const root = path.resolve(outputRoot);
  const target = safeTargetDirectory(root, bundle.simulationId);
  await fs.mkdir(root, { recursive: true });
  await assertAbsent(target);
  const temporary = await fs.mkdtemp(path.join(root, `.${bundle.simulationId}.simulated.tmp-`));
  if (path.dirname(temporary) !== root) throw new Error("Temporary simulation directory escaped the output root.");
  try {
    for (const item of bundle.artifacts) {
      await fs.writeFile(path.join(temporary, item.fileName), item.text, { encoding: "utf8", flag: "wx" });
    }
    await fs.rename(temporary, target);
  } catch (error) {
    await fs.rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}

export async function checkSimulatedEvaluationArtifacts(
  bundle: SimulatedActionQualityBundle,
  outputRoot: string
): Promise<string> {
  const root = path.resolve(outputRoot);
  const target = safeTargetDirectory(root, bundle.simulationId);
  const entries = await fs.readdir(target, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) {
    throw new Error(`Simulation artifact directory contains a non-file entry: ${target}`);
  }
  const expectedNames = bundle.artifacts.map((item) => item.fileName).sort();
  const actualNames = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(`Simulation artifact file set mismatch in ${target}.`);
  }
  for (const item of bundle.artifacts) {
    const actual = await fs.readFile(path.join(target, item.fileName), "utf8");
    if (actual !== item.text) {
      throw new Error(
        `Simulation artifact mismatch: ${item.fileName} (expected ${item.sha256}, received ${sha256(actual)}).`
      );
    }
  }
  return target;
}

function simulationCounts(
  runRecords: ActionQualityRunRecord[],
  judgeRecords: JudgeRecord[],
  selectorAudit: SimulatedProviderAudit,
  judgeAudit: SimulatedProviderAudit
): Record<string, unknown> {
  const llmRuns = runRecords.filter((record) => record.condition === "llm-next-step-v6");
  return {
    states: new Set(runRecords.map((record) => record.stateId)).size,
    runRecords: runRecords.length,
    runCompleted: runRecords.filter((record) => record.executionStatus === "completed").length,
    runErrors: runRecords.filter((record) => record.executionStatus === "error").length,
    llmSelected: llmRuns.filter((record) => record.transportOutcome === "selected").length,
    llmRuleFallbacks: llmRuns.filter((record) => record.transportOutcome === "rule_fallback").length,
    llmEvidenceGateSkips: llmRuns.filter((record) => record.transportOutcome === "not_called").length,
    llmTransportErrors: llmRuns.filter((record) => record.transportOutcome === "error").length,
    hardConstraintViolations: runRecords.reduce(
      (total, record) => total + record.hardConstraintViolations.length,
      0
    ),
    judgeRecords: judgeRecords.length,
    judgeCompleted: judgeRecords.filter((record) => record.executionStatus === "completed").length,
    judgeErrors: judgeRecords.filter((record) => record.executionStatus === "error").length,
    judgeRepairs: judgeRecords.filter((record) => record.attemptCount === 2).length,
    selectorUniquePrompts: selectorAudit.uniquePromptCount,
    selectorRequests: selectorAudit.requestCount,
    judgeUniquePrompts: judgeAudit.uniquePromptCount,
    judgeRequests: judgeAudit.requestCount
  };
}

function simulationJsonLines(records: unknown[]): string {
  return `${records.map((record) => JSON.stringify({ ...SIMULATION_MARKERS, ...(record as Record<string, unknown>) })).join("\n")}\n`;
}

function prettyJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function artifact(fileName: string, text: string): SimulatedEvaluationArtifact {
  return { fileName, text, sha256: sha256(text) };
}

function validateOptions(options: SimulatedEvaluationOptions): void {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(options.simulationId)) {
    throw new Error("simulationId contains unsupported characters.");
  }
  if (/formal/i.test(options.simulationId)) {
    throw new Error("simulationId must not contain 'formal'; simulated outputs cannot be named as formal evidence.");
  }
  if (!/^\d+$/.test(options.seed)) throw new Error("seed must be a non-negative integer string.");
  if (!Number.isInteger(options.resamples) || options.resamples < 1) {
    throw new Error("resamples must be a positive integer.");
  }
}

function verifyProtocolFreeze(pluginRoot: string): Record<string, unknown> {
  const manifestPath = path.join(pluginRoot, "evaluation", "ACTION_QUALITY_PROTOCOL_FREEZE_V2.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    files?: Record<string, string>;
    [key: string]: unknown;
  };
  for (const [relativePath, expected] of Object.entries(manifest.files ?? {})) {
    const absolutePath = path.resolve(pluginRoot, relativePath);
    if (path.dirname(absolutePath) !== pluginRoot && !absolutePath.startsWith(`${pluginRoot}${path.sep}`)) {
      throw new Error(`Frozen protocol path escaped the plugin root: ${relativePath}`);
    }
    const actual = sha256(readFileSync(absolutePath, "utf8"));
    if (actual !== expected) throw new Error(`Frozen protocol artifact changed: ${relativePath}`);
  }
  return manifest;
}

function safeTargetDirectory(root: string, simulationId: string): string {
  validateOptions({ simulationId, seed: "0", resamples: 1 });
  const target = path.resolve(root, `${simulationId}.simulated`);
  if (path.dirname(target) !== root) throw new Error("Simulation target escaped the output root.");
  return target;
}

async function assertAbsent(filePath: string): Promise<void> {
  try {
    await fs.access(filePath);
    throw new Error(`Refusing to overwrite locked simulation artifacts: ${filePath}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

export function parseSimulatedEvaluationCliArguments(args: string[]): SimulatedEvaluationCliArguments {
  const named: Partial<Record<"simulationId" | "seed" | "resamples", string>> = {};
  const positional: string[] = [];
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--check") {
      check = true;
      continue;
    }
    const key = ({
      "--simulation-id": "simulationId",
      "--seed": "seed",
      "--resamples": "resamples"
    } as const)[value];
    if (key) {
      const optionValue = args[index + 1];
      if (!optionValue || optionValue.startsWith("--")) throw new Error(`${value} requires a value.`);
      if (named[key] !== undefined) throw new Error(`${value} was supplied more than once.`);
      named[key] = optionValue;
      index += 1;
      continue;
    }
    if (value.startsWith("--")) throw new Error(`Unsupported simulation option: ${value}`);
    positional.push(value);
  }

  const simulationId = named.simulationId ?? positional.shift();
  const seed = named.seed ?? positional.shift();
  let resamplesText = named.resamples;
  if (!resamplesText && positional[0] !== "check") resamplesText = positional.shift();
  if (positional[0] === "check") {
    positional.shift();
    check = true;
  }
  if (positional.length) throw new Error(`Unexpected positional simulation arguments: ${positional.join(" ")}`);
  if (!simulationId) throw new Error("--simulation-id is required (or provide simulationId positionally).");
  if (!seed) throw new Error("--seed is required (or provide seed positionally).");
  resamplesText = resamplesText ?? "10000";
  if (!/^\d+$/.test(resamplesText)) throw new Error("--resamples must be a positive integer.");
  const resamples = Number(resamplesText);
  if (!Number.isSafeInteger(resamples) || resamples < 1) {
    throw new Error("--resamples must be a positive safe integer.");
  }
  return { simulationId, seed, resamples, check };
}

async function main(): Promise<void> {
  const parsed = parseSimulatedEvaluationCliArguments(process.argv.slice(2));
  const pluginRoot = path.resolve(__dirname, "..", "..");
  const bundle = await buildSimulatedActionQualityEvaluation({
    simulationId: parsed.simulationId,
    seed: parsed.seed,
    resamples: parsed.resamples,
    pluginRoot
  });
  const outputRoot = path.join(pluginRoot, "evaluation", "results");
  const target = parsed.check
    ? await checkSimulatedEvaluationArtifacts(bundle, outputRoot)
    : await writeSimulatedEvaluationArtifacts(bundle, outputRoot);
  const counts = bundle.simulationManifest.counts as Record<string, unknown>;
  process.stdout.write(
    `simulation_only=true formal_evidence=false simulation=${parsed.simulationId} states=${counts.states} ` +
    `run_errors=${counts.runErrors} judge_errors=${counts.judgeErrors} artifacts=${bundle.artifacts.length} ` +
    `mode=${parsed.check ? "check" : "write"} output=${target}\n`
  );
}

if (require.main === module) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
