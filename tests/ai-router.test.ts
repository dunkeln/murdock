import { describe, expect, it } from "vitest";

import { selectModelFromConfig, selectModelRoutesFromConfig } from "@/lib/ai";

describe("model routing", () => {
  it("uses the first configured provider by default", () => {
    expect(
      selectModelFromConfig(
        { use: "canonical-shaping" },
        [
          { id: "anthropic", hasKey: true, model: "claude-default" },
          { id: "openai", hasKey: true, model: "openai-default" },
        ],
      ),
    ).toEqual({
      ok: true,
      route: {
        provider: "anthropic",
        model: "claude-default",
        use: "canonical-shaping",
      },
    });
  });

  it("falls back to another configured provider when the preferred provider is unavailable", () => {
    expect(
      selectModelFromConfig(
        {
          preferredProvider: "anthropic",
          use: "canonical-shaping",
        },
        [
          { id: "anthropic", hasKey: false, model: "claude-default" },
          { id: "openai", hasKey: true, model: "openai-default" },
        ],
      ),
    ).toEqual({
      ok: true,
      route: {
        provider: "openai",
        model: "openai-default",
        use: "canonical-shaping",
      },
    });
  });

  it("returns ordered fallback routes when multiple providers are configured", () => {
    expect(
      selectModelRoutesFromConfig(
        {
          preferredProvider: "openai",
          use: "canonical-shaping",
        },
        [
          { id: "anthropic", hasKey: true, model: "claude-default" },
          { id: "openai", hasKey: true, model: "openai-default" },
        ],
      ),
    ).toEqual({
      ok: true,
      routes: [
        {
          provider: "openai",
          model: "openai-default",
          use: "canonical-shaping",
        },
        {
          provider: "anthropic",
          model: "claude-default",
          use: "canonical-shaping",
        },
      ],
    });
  });

  it("returns a structured configuration failure when no provider is configured", () => {
    expect(
      selectModelFromConfig(
        { use: "canonical-shaping" },
        [
          { id: "anthropic", hasKey: false, model: null },
          { id: "openai", hasKey: false, model: null },
        ],
      ),
    ).toEqual({
      ok: false,
      error: {
        isError: true,
        errorCategory: "configuration",
        isRetryable: false,
        message: "No configured model provider is available.",
      },
    });
  });
});
