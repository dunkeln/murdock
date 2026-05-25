import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { anthropicProvider } from "@/lib/server/ai/providers/anthropic";

const createMessageMock = vi.hoisted(() => vi.fn());
const anthropicConstructorMock = vi.hoisted(() =>
  vi.fn(function AnthropicClientMock() {
    return {
      messages: {
        create: createMessageMock,
      },
    };
  }),
);
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

vi.mock("@anthropic-ai/sdk", () => ({
  default: anthropicConstructorMock,
}));

describe("Anthropic provider", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    createMessageMock.mockReset();
    anthropicConstructorMock.mockClear();
  });

  afterEach(() => {
    if (originalAnthropicKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    }
  });

  it("marks the stable system prefix for prompt caching and reports cache usage", async () => {
    createMessageMock.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "murdock_test_schema",
          input: { ok: true },
        },
      ],
      usage: {
        cache_creation: {
          ephemeral_1h_input_tokens: 0,
          ephemeral_5m_input_tokens: 1200,
        },
        cache_creation_input_tokens: 1200,
        cache_read_input_tokens: 0,
        input_tokens: 80,
        output_tokens: 20,
      },
    });

    const result = await anthropicProvider.generateObject({
      jsonSchema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
        },
        required: ["ok"],
        additionalProperties: false,
      },
      maxOutputTokens: 128,
      messages: [{ role: "user", content: "Return ok." }],
      model: "claude-test",
      promptCache: { enabled: true, ttl: "5m" },
      schemaDescription: "Return ok.",
      schemaName: "murdock_test_schema",
      system: "Stable harness instructions.",
      temperature: 0,
    });

    expect(result).toMatchObject({
      ok: true,
      usage: {
        cacheCreationEphemeral5mInputTokens: 1200,
        cacheCreationInputTokens: 1200,
        cacheReadInputTokens: 0,
        inputTokens: 80,
        outputTokens: 20,
      },
    });
    const request = createMessageMock.mock.calls[0]?.[0];

    expect(request).toMatchObject({
      system: [
        {
          type: "text",
          text: "Stable harness instructions.",
          cache_control: { type: "ephemeral", ttl: "5m" },
        },
      ],
      tools: [
        expect.objectContaining({
          name: "murdock_test_schema",
        }),
      ],
    });
    expect(request.tools[0]).not.toHaveProperty("cache_control");
  });
});
