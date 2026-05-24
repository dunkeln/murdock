import { describe, expect, it } from "vitest";
import { z } from "zod";

import { modelErrorSchema } from "@/lib/ai";

describe("model adapter contracts", () => {
  it("keeps model errors structured and provider scoped", () => {
    expect(
      modelErrorSchema.parse({
        isError: true,
        errorCategory: "schema_validation",
        isRetryable: false,
        message: "Model output failed schema validation.",
        provider: "anthropic",
      }),
    ).toEqual({
      isError: true,
      errorCategory: "schema_validation",
      isRetryable: false,
      message: "Model output failed schema validation.",
      provider: "anthropic",
    });
  });

  it("validates generated object payloads through the source Zod schema", () => {
    const extractionSchema = z.object({
      facts: z.array(
        z.object({
          label: z.string().min(1),
          sourceSpanIds: z.array(z.uuid()),
        }),
      ),
    });

    expect(
      extractionSchema.safeParse({
        facts: [
          {
            label: "Response deadline",
            sourceSpanIds: ["33333333-3333-4333-8333-333333333333"],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      extractionSchema.safeParse({
        facts: [
          {
            label: "",
            sourceSpanIds: ["not-a-uuid"],
          },
        ],
      }).success,
    ).toBe(false);
  });
});
