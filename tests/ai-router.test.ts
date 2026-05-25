import { describe, expect, it } from "vitest";

import { selectModelFromConfig, selectModelRoutesFromConfig } from "@/lib/ai";

describe("model routing", () => {
  it("uses the first configured provider by default", () => {
    expect(
      selectModelFromConfig(
        { use: "harness-extract" },
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
        use: "harness-extract",
      },
    });
  });

  it("falls back to another configured provider when the preferred provider is unavailable", () => {
    expect(
      selectModelFromConfig(
        {
          preferredProvider: "anthropic",
          use: "harness-extract",
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
        use: "harness-extract",
      },
    });
  });

  it("returns ordered fallback routes when multiple providers are configured", () => {
    expect(
      selectModelRoutesFromConfig(
        {
          preferredProvider: "openai",
          use: "harness-extract",
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
          use: "harness-extract",
        },
        {
          provider: "anthropic",
          model: "claude-default",
          use: "harness-extract",
        },
      ],
    });
  });

  it("can disable fallback routes for provider-pinned workflows", () => {
    expect(
      selectModelRoutesFromConfig(
        {
          preferredProvider: "anthropic",
          use: "case-workspace-shaping",
        },
        [
          { id: "anthropic", hasKey: true, model: "claude-default" },
          { id: "openai", hasKey: true, model: "openai-default" },
        ],
        "single",
      ),
    ).toEqual({
      ok: true,
      routes: [
        {
          provider: "anthropic",
          model: "claude-default",
          use: "case-workspace-shaping",
        },
      ],
    });
  });

  it("returns a structured configuration failure when no provider is configured", () => {
    expect(
      selectModelFromConfig(
        { use: "harness-extract" },
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
