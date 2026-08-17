const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chooseLLMConfig,
  hasUsableLLMConfig,
  isOpenAICompatibleEndpoint,
  resolveLLMEndpoint
} = require("../out/llmConfiguration");

test("legacy AI feedback falls back to adaptive LLM settings", () => {
  const config = chooseLLMConfig(
    { modelName: "default-general-model" },
    {
      apiUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      modelName: "gpt-test"
    }
  );

  assert.deepEqual(config, {
    apiUrl: "https://api.openai.com/v1",
    apiKey: "secret",
    modelName: "gpt-test"
  });
  assert.equal(hasUsableLLMConfig(config), true);
});

test("adaptive callers prefer a complete adaptive configuration block", () => {
  const config = chooseLLMConfig(
    { apiUrl: "https://general.example/v1", apiKey: "general-secret", modelName: "general-model" },
    { apiUrl: "https://adaptive.example/v1", apiKey: "adaptive-secret", modelName: "adaptive-model" },
    "adaptive"
  );

  assert.deepEqual(config, {
    apiUrl: "https://adaptive.example/v1",
    apiKey: "adaptive-secret",
    modelName: "adaptive-model"
  });
});

test("an adaptive local endpoint never borrows the general API key", () => {
  const config = chooseLLMConfig(
    { apiUrl: "https://cloud.example/v1", apiKey: "cloud-secret", modelName: "cloud-model" },
    { apiUrl: "http://localhost:11434/api/generate", apiKey: "", modelName: "local-model" },
    "adaptive"
  );

  assert.deepEqual(config, {
    apiUrl: "http://localhost:11434/api/generate",
    apiKey: "",
    modelName: "local-model"
  });
});

test("an incomplete preferred block falls back as a whole without mixing fields", () => {
  const config = chooseLLMConfig(
    { apiUrl: "https://general.example/v1", apiKey: "general-secret", modelName: "general-model" },
    { apiUrl: "http://localhost:11434/api/generate", apiKey: "adaptive-secret" },
    "adaptive"
  );

  assert.deepEqual(config, {
    apiUrl: "https://general.example/v1",
    apiKey: "general-secret",
    modelName: "general-model"
  });
});

test("general callers keep preferring the complete general block", () => {
  const config = chooseLLMConfig(
    { apiUrl: "https://general.example/v1", apiKey: "general-secret", modelName: "general-model" },
    { apiUrl: "https://adaptive.example/v1", apiKey: "adaptive-secret", modelName: "adaptive-model" },
    "general"
  );

  assert.equal(config.apiUrl, "https://general.example/v1");
  assert.equal(config.apiKey, "general-secret");
  assert.equal(config.modelName, "general-model");
});

test("API key is optional for a configured local LLM", () => {
  assert.equal(hasUsableLLMConfig({
    apiUrl: "http://localhost:11434/api/generate",
    apiKey: "",
    modelName: "local-model"
  }), true);
});

test("OpenAI-compatible base URLs resolve to chat completions", () => {
  assert.equal(isOpenAICompatibleEndpoint("https://api.openai.com/v1"), true);
  assert.equal(
    resolveLLMEndpoint("https://api.openai.com/v1/"),
    "https://api.openai.com/v1/chat/completions"
  );
  assert.equal(
    resolveLLMEndpoint("http://localhost:11434/api/generate"),
    "http://localhost:11434/api/generate"
  );
});
