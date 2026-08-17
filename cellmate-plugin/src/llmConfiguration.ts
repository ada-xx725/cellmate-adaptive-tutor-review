export interface LLMConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
}

export interface LLMSettings {
  apiUrl?: string;
  apiKey?: string;
  modelName?: string;
}

export function chooseLLMConfig(
  general: LLMSettings,
  adaptive: LLMSettings,
  prefer: "general" | "adaptive" = "general"
): LLMConfig {
  const first = prefer === "general" ? general : adaptive;
  const second = prefer === "general" ? adaptive : general;
  const firstConfig = normalise(first);
  const secondConfig = normalise(second);
  if (hasUsableLLMConfig(firstConfig)) return firstConfig;
  if (hasUsableLLMConfig(secondConfig)) return secondConfig;
  return firstConfig;
}

export function hasUsableLLMConfig(config: LLMConfig): boolean {
  return Boolean(config.apiUrl && config.modelName);
}

export function isOpenAICompatibleEndpoint(apiUrl: string): boolean {
  const lower = apiUrl.toLowerCase();
  return lower.includes("/chat/completions")
    || /\/v1\/?$/i.test(apiUrl)
    || lower.includes("api.openai.com");
}

export function resolveLLMEndpoint(apiUrl: string): string {
  const trimmed = apiUrl.replace(/\/+$/, "");
  return /\/v1$/i.test(trimmed) ? `${trimmed}/chat/completions` : apiUrl;
}

function normalise(settings: LLMSettings): LLMConfig {
  return {
    apiUrl: settings.apiUrl || "",
    apiKey: settings.apiKey || "",
    modelName: settings.modelName || ""
  };
}
