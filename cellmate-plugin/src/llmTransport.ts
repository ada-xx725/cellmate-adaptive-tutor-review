import axios from "axios";
import {
  hasUsableLLMConfig,
  isOpenAICompatibleEndpoint,
  LLMConfig,
  resolveLLMEndpoint
} from "./llmConfiguration";

export type LlmTransportErrorCategory =
  | "configuration"
  | "timeout"
  | "authentication"
  | "rate_limit"
  | "network"
  | "http"
  | "invalid_response"
  | "invalid_json"
  | "unknown";

export interface LlmCompletionRequest {
  system?: string;
  prompt: string;
  timeoutMs?: number;
  temperature?: number;
  format?: "text" | "json";
}

export interface LlmHttpResponse {
  data: unknown;
  status?: number;
}

export interface LlmHttpClient {
  post(
    url: string,
    body: unknown,
    config: { headers: Record<string, string>; timeout: number }
  ): Promise<LlmHttpResponse>;
}

export class LlmTransportError extends Error {
  constructor(
    public readonly category: LlmTransportErrorCategory,
    message: string,
    public readonly retryable: boolean,
    public readonly status?: number
  ) {
    super(message);
    this.name = "LlmTransportError";
  }
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_HTTP_CLIENT: LlmHttpClient = {
  post: (url, body, config) => axios.post(url, body, config)
};

export class LlmTransport {
  constructor(
    private readonly httpClient: LlmHttpClient = DEFAULT_HTTP_CLIENT,
    private readonly defaultTimeoutMs = DEFAULT_TIMEOUT_MS
  ) {}

  async complete(config: LLMConfig, request: LlmCompletionRequest): Promise<string> {
    if (!hasUsableLLMConfig(config)) {
      throw new LlmTransportError(
        "configuration",
        "An LLM API URL and model name are required.",
        false
      );
    }

    const openAICompatible = isOpenAICompatibleEndpoint(config.apiUrl);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    try {
      const response = await this.httpClient.post(
        resolveLLMEndpoint(config.apiUrl),
        buildPayload(config, request, openAICompatible),
        {
          headers,
          timeout: normaliseTimeout(request.timeoutMs, this.defaultTimeoutMs)
        }
      );
      return extractResponseContent(response.data);
    } catch (error) {
      throw classifyTransportError(error);
    }
  }

  async completeJson<T>(
    config: LLMConfig,
    request: Omit<LlmCompletionRequest, "format">
  ): Promise<T> {
    const content = await this.complete(config, { ...request, format: "json" });
    try {
      return JSON.parse(extractJson(content)) as T;
    } catch {
      throw new LlmTransportError(
        "invalid_json",
        "The LLM response did not contain valid JSON.",
        false
      );
    }
  }
}

export function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) return content.slice(start, end + 1);
  return content.trim();
}

function buildPayload(
  config: LLMConfig,
  request: LlmCompletionRequest,
  openAICompatible: boolean
): unknown {
  if (openAICompatible) {
    const messages = [];
    if (request.system) messages.push({ role: "system", content: request.system });
    messages.push({ role: "user", content: request.prompt });
    return {
      model: config.modelName,
      messages,
      ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      ...(request.format === "json" ? { response_format: { type: "json_object" } } : {})
    };
  }

  return {
    model: config.modelName,
    prompt: request.system ? `${request.system}\n\n${request.prompt}` : request.prompt,
    stream: false
  };
}

function extractResponseContent(data: unknown): string {
  const direct = contentFromRecord(data);
  if (direct !== undefined) return direct;
  if (typeof data !== "string") {
    throw new LlmTransportError(
      "invalid_response",
      "The LLM response did not contain text content.",
      false
    );
  }

  const trimmed = data.trim();
  if (!trimmed) {
    throw new LlmTransportError("invalid_response", "The LLM response was empty.", false);
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const parsedContent = contentFromRecord(parsed);
    if (parsedContent !== undefined) return parsedContent;
  } catch {
    // Some Ollama versions return newline-delimited JSON even when non-streaming
    // was requested. Parse those chunks before accepting a plain text response.
  }

  const chunks: string[] = [];
  let sawJsonLine = false;
  for (const line of trimmed.split(/\r?\n/).filter(Boolean)) {
    try {
      const chunk = contentFromRecord(JSON.parse(line) as unknown);
      sawJsonLine = true;
      if (chunk !== undefined) chunks.push(chunk);
    } catch {
      sawJsonLine = false;
      break;
    }
  }
  if (sawJsonLine && chunks.length) return chunks.join("");
  return trimmed;
}

function contentFromRecord(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.response === "string") return value.response;
  if (isRecord(value.message) && typeof value.message.content === "string") {
    return value.message.content;
  }
  if (Array.isArray(value.choices)) {
    const first = value.choices[0];
    if (isRecord(first) && isRecord(first.message) && typeof first.message.content === "string") {
      return first.message.content;
    }
  }
  return undefined;
}

function classifyTransportError(error: unknown): LlmTransportError {
  if (error instanceof LlmTransportError) return error;
  const details = isRecord(error) ? error : {};
  const code = typeof details.code === "string" ? details.code.toUpperCase() : "";
  const response = isRecord(details.response) ? details.response : undefined;
  const status = typeof response?.status === "number" ? response.status : undefined;

  if (code === "ECONNABORTED" || code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT") {
    return new LlmTransportError("timeout", "The LLM request timed out.", true, status);
  }
  if (status === 401 || status === 403) {
    return new LlmTransportError("authentication", "The LLM provider rejected the credentials.", false, status);
  }
  if (status === 429) {
    return new LlmTransportError("rate_limit", "The LLM provider rate limit was reached.", true, status);
  }
  if (status !== undefined) {
    return new LlmTransportError(
      "http",
      `The LLM provider returned HTTP ${status}.`,
      status >= 500,
      status
    );
  }
  if (details.request !== undefined || /^(ECONN|ENET|EAI_|EHOST)/.test(code)) {
    return new LlmTransportError("network", "The LLM provider could not be reached.", true);
  }
  return new LlmTransportError("unknown", "The LLM request failed.", false);
}

function normaliseTimeout(timeoutMs: number | undefined, fallback: number): number {
  return Number.isFinite(timeoutMs) && (timeoutMs ?? 0) > 0 ? Math.floor(timeoutMs as number) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
