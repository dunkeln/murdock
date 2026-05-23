import "server-only";

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY_ENV = "MISTRAL_API_KEY";

export function createMistralClient() {
  const apiKey = process.env[MISTRAL_API_KEY_ENV];

  if (!apiKey) {
    throw new Error(`${MISTRAL_API_KEY_ENV} is required for Mistral API calls.`);
  }

  return new Mistral({ apiKey });
}
