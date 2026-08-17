const assert = require("node:assert/strict");
const test = require("node:test");
const {
  LlmTransport,
  LlmTransportError
} = require("../out/llmTransport");
const { AdaptiveLlmClient } = require("../out/adaptive/llmClient");

const OPENAI_CONFIG = {
  apiUrl: "https://api.openai.com/v1/",
  apiKey: "test-secret",
  modelName: "gpt-test"
};

test("sends OpenAI-compatible JSON requests with the configured timeout and parses fenced JSON", async () => {
  let captured;
  const transport = new LlmTransport({
    post: async (url, body, config) => {
      captured = { url, body, config };
      return { data: { choices: [{ message: { content: "```json\n{\"accepted\":true}\n```" } }] } };
    }
  });

  const result = await transport.completeJson(OPENAI_CONFIG, {
    system: "Return JSON.",
    prompt: "Assess this.",
    timeoutMs: 4321,
    temperature: 0.2
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(captured.url, "https://api.openai.com/v1/chat/completions");
  assert.equal(captured.config.timeout, 4321);
  assert.equal(captured.config.headers.Authorization, "Bearer test-secret");
  assert.deepEqual(captured.body.messages, [
    { role: "system", content: "Return JSON." },
    { role: "user", content: "Assess this." }
  ]);
  assert.deepEqual(captured.body.response_format, { type: "json_object" });
});

test("sends a non-streaming Ollama request without an Authorization header when the key is empty", async () => {
  let captured;
  const transport = new LlmTransport({
    post: async (url, body, config) => {
      captured = { url, body, config };
      return { data: { response: "local answer" } };
    }
  });

  const result = await transport.complete({
    apiUrl: "http://localhost:11434/api/generate",
    apiKey: "",
    modelName: "local-model"
  }, {
    system: "System context",
    prompt: "User prompt"
  });

  assert.equal(result, "local answer");
  assert.equal(captured.url, "http://localhost:11434/api/generate");
  assert.equal(captured.config.timeout, 15000);
  assert.equal("Authorization" in captured.config.headers, false);
  assert.deepEqual(captured.body, {
    model: "local-model",
    prompt: "System context\n\nUser prompt",
    stream: false
  });
});

test("parses Ollama message objects and legacy newline-delimited responses", async () => {
  const responses = [
    { message: { content: "chat response" } },
    '{"response":"first "}\n{"response":"second"}\n'
  ];
  const transport = new LlmTransport({
    post: async () => ({ data: responses.shift() })
  });
  const config = { apiUrl: "http://localhost:11434/api/generate", apiKey: "", modelName: "local" };

  assert.equal(await transport.complete(config, { prompt: "one" }), "chat response");
  assert.equal(await transport.complete(config, { prompt: "two" }), "first second");
});

test("classifies invalid response bodies and invalid JSON separately", async () => {
  const invalidResponse = new LlmTransport({ post: async () => ({ data: { done: true } }) });
  await assert.rejects(
    invalidResponse.complete(OPENAI_CONFIG, { prompt: "test" }),
    errorWith("invalid_response", false)
  );

  const invalidJson = new LlmTransport({
    post: async () => ({ data: { choices: [{ message: { content: "not JSON" } }] } })
  });
  await assert.rejects(
    invalidJson.completeJson(OPENAI_CONFIG, { prompt: "test" }),
    errorWith("invalid_json", false)
  );
});

test("classifies timeout, authentication, rate-limit, HTTP, network, and unknown failures", async () => {
  const cases = [
    [{ code: "ECONNABORTED" }, "timeout", true, undefined],
    [{ response: { status: 401 } }, "authentication", false, 401],
    [{ response: { status: 429 } }, "rate_limit", true, 429],
    [{ response: { status: 503 } }, "http", true, 503],
    [{ request: {} }, "network", true, undefined],
    [new Error("unexpected"), "unknown", false, undefined]
  ];

  for (const [failure, category, retryable, status] of cases) {
    const transport = new LlmTransport({ post: async () => { throw failure; } });
    await assert.rejects(
      transport.complete(OPENAI_CONFIG, { prompt: "test" }),
      error => error instanceof LlmTransportError
        && error.category === category
        && error.retryable === retryable
        && error.status === status
    );
  }
});

test("rejects missing endpoint or model before making an HTTP request", async () => {
  let calls = 0;
  const transport = new LlmTransport({
    post: async () => {
      calls += 1;
      return { data: { response: "unexpected" } };
    }
  });

  await assert.rejects(
    transport.complete({ apiUrl: "", apiKey: "", modelName: "model" }, { prompt: "test" }),
    errorWith("configuration", false)
  );
  assert.equal(calls, 0);
});

test("the adaptive client reuses the transport and reports the model used for generation", async () => {
  const localConfig = {
    apiUrl: "http://localhost:11434/api/generate",
    apiKey: "",
    modelName: "local-model"
  };
  let receivedConfig;
  const client = new AdaptiveLlmClient({
    completeJson: async config => {
      receivedConfig = config;
      return { title: "Generated" };
    }
  }, () => localConfig);

  const completion = await client.completeJsonWithModel({ system: "system", prompt: "prompt" });
  assert.deepEqual(receivedConfig, localConfig);
  assert.deepEqual(completion, {
    value: { title: "Generated" },
    modelName: "local-model"
  });
});

function errorWith(category, retryable) {
  return error => error instanceof LlmTransportError
    && error.category === category
    && error.retryable === retryable;
}
