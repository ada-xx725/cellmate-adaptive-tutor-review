import { createHash } from "crypto";
import { AdaptiveAction } from "../../src/adaptive/types";
import { LlmHttpClient, LlmHttpResponse } from "../../src/llmTransport";
import type { FormalActionQualityState } from "../actionQualityRunner";

export type SimulatedProviderRole = "selector" | "judge";
export type SimulatedFaultMode = "valid" | "repair_once" | "persistent_invalid" | "timeout";
export type SimulatedResponseOutcome = "valid_response" | "invalid_response" | "timeout_error";

export interface SimulatedFaultContext {
  role: SimulatedProviderRole;
  promptFingerprint: string;
  promptOrdinal: number;
}

export type SimulatedFaultResolver = (context: SimulatedFaultContext) => SimulatedFaultMode;

export interface SimulatedRequestAuditEvent {
  role: SimulatedProviderRole;
  promptFingerprint: string;
  promptOrdinal: number;
  attempt: number;
  faultMode: SimulatedFaultMode;
  outcome: SimulatedResponseOutcome;
  modelName: string;
  timeoutMs: number;
  authorizationHeaderPresent: boolean;
  jsonResponseRequested: boolean;
  openAiCompatibleEndpoint: boolean;
}

export interface SimulatedProviderAudit {
  role: SimulatedProviderRole;
  networkCalls: 0;
  rawPromptsRecorded: false;
  rawResponsesRecorded: false;
  requestCount: number;
  uniquePromptCount: number;
  faultModeCounts: Record<SimulatedFaultMode, number>;
  outcomeCounts: Record<SimulatedResponseOutcome, number>;
  events: SimulatedRequestAuditEvent[];
}

export interface SimulatedLlmHttpClientOptions {
  role: SimulatedProviderRole;
  faultResolver?: SimulatedFaultResolver;
}

interface ParsedOpenAiRequest {
  modelName: string;
  prompt: string;
  jsonResponseRequested: boolean;
}

interface SelectorEvidence {
  status?: string;
  summary?: string;
}

interface SelectorHistoryEntry {
  action?: AdaptiveAction;
}

interface SelectorCourseContext {
  exerciseId?: string;
  nextConcepts?: string[];
}

interface SelectorCatalogEntry {
  id: string;
  kind: "current_check" | "mastery" | "history" | "course";
}

interface CandidateDecision {
  status?: "action" | "needs_evidence";
  action?: AdaptiveAction;
}

const SELECTOR_REPAIR_SUFFIX =
  "\nThe previous response was invalid. Re-read the constraints and return a corrected JSON response.";
const JUDGE_REPAIR_SUFFIX =
  "\nThe previous response was rejected. Return one corrected JSON object that obeys every constraint.";
const ACTIONS: AdaptiveAction[] = [
  "HINT",
  "RETRY_WITH_SCAFFOLD",
  "EASIER",
  "SIMILAR",
  "HARDER",
  "NEXT_CONCEPT"
];

/**
 * In-memory OpenAI-compatible provider used only to rehearse the evaluation pipeline.
 * It deliberately records fingerprints and request metadata, never prompt or response text.
 */
export class SimulatedLlmHttpClient implements LlmHttpClient {
  private readonly role: SimulatedProviderRole;
  private readonly faultResolver: SimulatedFaultResolver;
  private readonly promptOrdinals = new Map<string, number>();
  private readonly promptAttempts = new Map<string, number>();
  private readonly promptFaultModes = new Map<string, SimulatedFaultMode>();
  private readonly events: SimulatedRequestAuditEvent[] = [];

  constructor(options: SimulatedLlmHttpClientOptions) {
    this.role = options.role;
    this.faultResolver = options.faultResolver ?? deterministicSimulationFaultMode;
  }

  async post(
    url: string,
    body: unknown,
    config: { headers: Record<string, string>; timeout: number }
  ): Promise<LlmHttpResponse> {
    const request = parseOpenAiRequest(body);
    const basePrompt = stripRepairSuffix(request.prompt);
    const promptFingerprint = sha256(`${this.role}\n${basePrompt}`);
    const promptOrdinal = this.ordinalFor(promptFingerprint);
    const attempt = (this.promptAttempts.get(promptFingerprint) ?? 0) + 1;
    this.promptAttempts.set(promptFingerprint, attempt);
    const faultMode = this.faultModeFor(promptFingerprint, promptOrdinal);
    const invalid = faultMode === "persistent_invalid" || (faultMode === "repair_once" && attempt === 1);
    const outcome: SimulatedResponseOutcome = faultMode === "timeout"
      ? "timeout_error"
      : invalid ? "invalid_response" : "valid_response";

    this.events.push({
      role: this.role,
      promptFingerprint,
      promptOrdinal,
      attempt,
      faultMode,
      outcome,
      modelName: request.modelName,
      timeoutMs: config.timeout,
      authorizationHeaderPresent: Object.keys(config.headers).some((name) => name.toLowerCase() === "authorization"),
      jsonResponseRequested: request.jsonResponseRequested,
      openAiCompatibleEndpoint: /\/chat\/completions\/?$/i.test(url)
    });

    if (faultMode === "timeout") throw simulatedTimeoutError();

    const validPayload = this.role === "selector"
      ? simulatedSelectorResponse(basePrompt)
      : simulatedJudgeResponse(basePrompt);
    const payload = invalid
      ? { ...validPayload, evidence_reference_ids: ["simulation:unknown-evidence"] }
      : validPayload;
    return {
      status: 200,
      data: {
        choices: [{ message: { content: JSON.stringify(payload) } }]
      }
    };
  }

  getAudit(): SimulatedProviderAudit {
    const faultModeCounts = emptyCounts<SimulatedFaultMode>([
      "valid",
      "repair_once",
      "persistent_invalid",
      "timeout"
    ]);
    for (const mode of this.promptFaultModes.values()) faultModeCounts[mode] += 1;
    const outcomeCounts = emptyCounts<SimulatedResponseOutcome>([
      "valid_response",
      "invalid_response",
      "timeout_error"
    ]);
    for (const event of this.events) outcomeCounts[event.outcome] += 1;
    return {
      role: this.role,
      networkCalls: 0,
      rawPromptsRecorded: false,
      rawResponsesRecorded: false,
      requestCount: this.events.length,
      uniquePromptCount: this.promptOrdinals.size,
      faultModeCounts,
      outcomeCounts,
      events: this.events.map((event) => ({ ...event }))
    };
  }

  private ordinalFor(fingerprint: string): number {
    const existing = this.promptOrdinals.get(fingerprint);
    if (existing !== undefined) return existing;
    const ordinal = this.promptOrdinals.size + 1;
    this.promptOrdinals.set(fingerprint, ordinal);
    return ordinal;
  }

  private faultModeFor(fingerprint: string, promptOrdinal: number): SimulatedFaultMode {
    const existing = this.promptFaultModes.get(fingerprint);
    if (existing) return existing;
    const mode = this.faultResolver({
      role: this.role,
      promptFingerprint: fingerprint,
      promptOrdinal
    });
    this.promptFaultModes.set(fingerprint, mode);
    return mode;
  }
}

export function deterministicSimulationFaultMode(context: SimulatedFaultContext): SimulatedFaultMode {
  if (context.role === "selector") {
    if (context.promptOrdinal % 23 === 0) return "timeout";
    if (context.promptOrdinal % 17 === 0) return "persistent_invalid";
    if (context.promptOrdinal % 11 === 0) return "repair_once";
    return "valid";
  }
  if (context.promptOrdinal % 41 === 0) return "timeout";
  if (context.promptOrdinal % 29 === 0) return "persistent_invalid";
  if (context.promptOrdinal % 13 === 0) return "repair_once";
  return "valid";
}

function simulatedSelectorResponse(prompt: string): Record<string, unknown> {
  const evidence = jsonLine<SelectorEvidence>(prompt, "Evidence: ");
  const mastery = jsonLine<Record<string, number>>(prompt, "Learner mastery before this attempt: ");
  const history = jsonLine<SelectorHistoryEntry[]>(prompt, "Recent attempts: ");
  const course = jsonLine<SelectorCourseContext>(prompt, "Course context: ");
  const catalog = jsonLine<SelectorCatalogEntry[]>(prompt, "Evidence catalog: ");
  const allowed = lineValue(prompt, "Allowed actions for this input after applying the hard constraints: ")
    .split(",")
    .map((value) => value.trim().replace(/\.$/, ""))
    .filter(isAdaptiveAction);
  const scores = Object.values(mastery).filter((value) => typeof value === "number" && Number.isFinite(value));
  const averageMastery = scores.length
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : 50;
  const lastAction = history.at(-1)?.action;
  let action: AdaptiveAction;

  if (evidence.status === "failed") {
    action = lastAction === "RETRY_WITH_SCAFFOLD" || lastAction === "EASIER"
      ? "EASIER"
      : lastAction === "HINT" ? "RETRY_WITH_SCAFFOLD" : "HINT";
  } else if (/not covered:/i.test(evidence.summary ?? "")) {
    action = "SIMILAR";
  } else if (averageMastery < 70) {
    action = "SIMILAR";
  } else if (averageMastery < 85) {
    action = "HARDER";
  } else if (course.nextConcepts?.length) {
    action = "NEXT_CONCEPT";
  } else {
    action = "HARDER";
  }
  if (!allowed.includes(action)) action = allowed[0] ?? "SIMILAR";

  const references = ["check:current"];
  if (action === "HARDER" || action === "NEXT_CONCEPT") {
    const masteryReference = catalog.find((entry) => entry.kind === "mastery")?.id;
    if (masteryReference) references.push(masteryReference);
  }
  if (action === "NEXT_CONCEPT") {
    const courseReference = catalog.find((entry) => entry.kind === "course")?.id;
    if (courseReference) references.push(courseReference);
  }
  if (["RETRY_WITH_SCAFFOLD", "EASIER"].includes(action)) {
    const historyReference = catalog.filter((entry) => entry.kind === "history").at(-1)?.id;
    if (historyReference) references.push(historyReference);
  }

  return {
    action,
    reason: selectorReason(action),
    evidence_reference_ids: Array.from(new Set(references)).slice(0, 5),
    confidence: 0.84
  };
}

function simulatedJudgeResponse(prompt: string): Record<string, unknown> {
  const state = jsonLine<FormalActionQualityState>(prompt, "Blinded state: ");
  const candidate = jsonLine<CandidateDecision>(prompt, "Candidate decision: ");
  const score = judgeScore(state, candidate);
  const references = judgeReferences(state, candidate);
  return {
    score,
    critical_error: score === 1,
    confidence: 5,
    reason: judgeReason(state, candidate, score),
    evidence_reference_ids: references
  };
}

function judgeScore(state: FormalActionQualityState, candidate: CandidateDecision): number {
  const insufficient = state.stratum === "needs_evidence"
    || state.evidence.status === "not_run"
    || state.evidence.status === "unavailable"
    || state.evidence.has_reliable_check === false;
  if (insufficient) return candidate.status === "needs_evidence" ? 5 : 1;
  if (candidate.status !== "action" || !candidate.action) return 1;
  const action = candidate.action;

  if (state.evidence.status === "failed") {
    if (action === "HARDER" || action === "NEXT_CONCEPT") return 1;
    if (state.stratum === "first_failure") {
      return scoreForAction(action, { HINT: 5, RETRY_WITH_SCAFFOLD: 4, EASIER: 3, SIMILAR: 2 });
    }
    const previousSupport = state.history.at(-1)?.support_received.type;
    if (previousSupport === "hint") {
      return scoreForAction(action, { RETRY_WITH_SCAFFOLD: 5, EASIER: 4, HINT: 2, SIMILAR: 2 });
    }
    if (previousSupport === "scaffold") {
      return scoreForAction(action, { EASIER: 5, RETRY_WITH_SCAFFOLD: 2, HINT: 2, SIMILAR: 2 });
    }
    return scoreForAction(action, { EASIER: 5, RETRY_WITH_SCAFFOLD: 3, HINT: 2, SIMILAR: 2 });
  }

  if (["HINT", "RETRY_WITH_SCAFFOLD", "EASIER"].includes(action)) return 1;
  const courseNextAvailable = Boolean(state.course_context?.next_concepts?.length);
  if (action === "NEXT_CONCEPT" && !courseNextAvailable) return 1;
  if (state.stratum === "narrow_pass") {
    return scoreForAction(action, { SIMILAR: 5, HARDER: 3, NEXT_CONCEPT: 2 });
  }
  if (state.stratum === "developing_pass") {
    return scoreForAction(action, { SIMILAR: 5, HARDER: 2, NEXT_CONCEPT: 1 });
  }
  if (state.stratum === "established_pass") {
    return courseNextAvailable
      ? scoreForAction(action, { NEXT_CONCEPT: 5, HARDER: 4, SIMILAR: 3 })
      : scoreForAction(action, { HARDER: 5, SIMILAR: 4, NEXT_CONCEPT: 1 });
  }
  return scoreForAction(action, { SIMILAR: 4, HARDER: 4, NEXT_CONCEPT: courseNextAvailable ? 5 : 1 });
}

function judgeReferences(state: FormalActionQualityState, candidate: CandidateDecision): string[] {
  const references = ["check:status"];
  if (state.stratum === "narrow_pass") references.push("check:coverage");
  if (state.stratum === "repeated_failure" && state.history.length) {
    references.push(`history:${state.history.at(-1)?.attempt_index}`);
  }
  if (state.evidence.status === "passed") {
    const concept = Object.keys(state.learner_before.concepts)[0];
    if (concept) references.push(`learner:${encodeURIComponent(concept)}`);
  }
  if (candidate.action === "NEXT_CONCEPT" && state.course_context) references.push("course:context");
  return Array.from(new Set(references)).slice(0, 5);
}

function judgeReason(
  state: FormalActionQualityState,
  candidate: CandidateDecision,
  score: number
): string {
  if (state.stratum === "needs_evidence") {
    return score === 5
      ? "The decision correctly pauses because the recorded check is insufficient."
      : "A teaching action contradicts the insufficient recorded check.";
  }
  if (candidate.status !== "action") return "The recorded check is sufficient, so an action is required.";
  if (score === 1) return "The action critically contradicts the recorded evidence or progression constraints.";
  if (state.stratum === "repeated_failure") return "The action is judged against the recorded outcome of prior support.";
  if (state.stratum === "narrow_pass") return "The action is judged against the explicitly limited positive coverage.";
  return "The action is judged against the current check, mastery, and available course progression.";
}

function selectorReason(action: AdaptiveAction): string {
  const reasons: Record<AdaptiveAction, string> = {
    HINT: "The reliable first failure is best addressed with one targeted clue.",
    RETRY_WITH_SCAFFOLD: "The recorded hint did not resolve the task, so ordered scaffolding is appropriate.",
    EASIER: "Prior support did not resolve the task, so a smaller prerequisite step is appropriate.",
    SIMILAR: "The evidence supports another comparable task before progression.",
    HARDER: "The mastery evidence supports one additional challenge on the same concept.",
    NEXT_CONCEPT: "High mastery and the recorded course target support moving to the next concept."
  };
  return reasons[action];
}

function scoreForAction(action: AdaptiveAction, scores: Partial<Record<AdaptiveAction, number>>): number {
  return scores[action] ?? 1;
}

function parseOpenAiRequest(body: unknown): ParsedOpenAiRequest {
  if (!isRecord(body) || typeof body.model !== "string" || !Array.isArray(body.messages)) {
    throw new Error("The simulated provider requires an OpenAI-compatible request body.");
  }
  const userMessages = body.messages.filter(
    (message): message is Record<string, unknown> => isRecord(message) && message.role === "user"
  );
  const prompt = userMessages.at(-1)?.content;
  if (typeof prompt !== "string" || !prompt) {
    throw new Error("The simulated provider request did not contain a user prompt.");
  }
  return {
    modelName: body.model,
    prompt,
    jsonResponseRequested: isRecord(body.response_format) && body.response_format.type === "json_object"
  };
}

function stripRepairSuffix(prompt: string): string {
  for (const suffix of [SELECTOR_REPAIR_SUFFIX, JUDGE_REPAIR_SUFFIX]) {
    if (prompt.endsWith(suffix)) return prompt.slice(0, -suffix.length);
  }
  return prompt;
}

function jsonLine<T>(prompt: string, prefix: string): T {
  const value = lineValue(prompt, prefix);
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new Error(`The simulated provider could not parse ${prefix.trim()}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function lineValue(prompt: string, prefix: string): string {
  const line = prompt.split(/\r?\n/).find((candidate) => candidate.startsWith(prefix));
  if (!line) throw new Error(`The simulated provider prompt omitted ${prefix.trim()}.`);
  return line.slice(prefix.length);
}

function isAdaptiveAction(value: string): value is AdaptiveAction {
  return ACTIONS.includes(value as AdaptiveAction);
}

function simulatedTimeoutError(): Error {
  const error = new Error("Deterministic simulated provider timeout.") as Error & {
    code: string;
    request: Record<string, unknown>;
  };
  error.code = "ETIMEDOUT";
  error.request = { simulated: true };
  return error;
}

function emptyCounts<T extends string>(values: T[]): Record<T, number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T, number>;
}

function sha256(content: string): string {
  return createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
