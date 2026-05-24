import "server-only";

import {
  type SelectModelInput,
  type SelectModelResult,
  type SelectModelRoutesResult,
  selectModelFromConfig,
  selectModelRoutesFromConfig,
} from "@/lib/ai";

const providers = [
  {
    id: "anthropic",
    hasKey: Boolean(process.env.ANTHROPIC_API_KEY),
    model: process.env.ANTHROPIC_MODEL || null,
  },
  {
    id: "openai",
    hasKey: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || null,
  },
];

export function selectModel(
  input: SelectModelInput = {},
): SelectModelResult {
  return selectModelFromConfig(input, providers);
}

export function selectModelRoutes(
  input: SelectModelInput = {},
): SelectModelRoutesResult {
  return selectModelRoutesFromConfig(input, providers);
}
