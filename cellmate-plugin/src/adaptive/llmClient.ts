import { LLMConfig, hasUsableLLMConfig } from "../llmConfiguration";
import { LlmTransport } from "../llmTransport";

export interface JsonCompletion<T> {
  value: T;
  modelName: string;
}

export class AdaptiveLlmClient {
  constructor(
    private readonly transport = new LlmTransport(),
    private readonly configProvider: () => LLMConfig = defaultAdaptiveConfig
  ) {}

  async completeJson<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<T | undefined> {
    return (await this.completeJsonWithModel<T>(input))?.value;
  }

  async completeJsonWithModel<T>(input: {
    system: string;
    prompt: string;
    timeoutMs?: number;
  }): Promise<JsonCompletion<T> | undefined> {
    const config = this.configProvider();
    if (!hasUsableLLMConfig(config)) return undefined;
    try {
      const value = await this.transport.completeJson<T>(config, {
        ...input,
        temperature: 0.2
      });
      return { value, modelName: config.modelName };
    } catch {
      return undefined;
    }
  }
}

function defaultAdaptiveConfig(): LLMConfig {
  // Keep the VS Code dependency behind the production-only configuration
  // adapter so this client and its transport can be imported by Node runners.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { readWorkspaceLlmConfig } = require("../workspaceLlmConfiguration") as typeof import("../workspaceLlmConfiguration");
  return readWorkspaceLlmConfig("adaptive");
}

export { extractJson } from "../llmTransport";
