"use server";

import { z } from "zod";

import { askHarnessQuestion } from "@/lib/server/case-workspace/query";
import { withLangfuseObservation } from "@/lib/server/telemetry/langfuse";

const askWorkspaceHarnessInputSchema = z.object({
  caseId: z.uuid(),
  question: z.string().trim().min(1).max(800),
});

export type AskWorkspaceHarnessActionResult =
  | Awaited<ReturnType<typeof askHarnessQuestion>>
  | {
      errorCategory: "schema_validation";
      isRetryable: false;
      message: string;
      ok: false;
    };

export async function askWorkspaceHarnessAction(
  formData: FormData,
): Promise<AskWorkspaceHarnessActionResult> {
  return withLangfuseObservation(
    {
      name: "server-action.ask-workspace-harness",
      input: {
        caseId: formData.get("caseId"),
        questionLength:
          typeof formData.get("question") === "string"
            ? String(formData.get("question")).length
            : 0,
      },
      output: (result) => ({
        ok: result.ok,
        errorCategory: result.ok ? null : result.errorCategory,
      }),
    },
    async () => {
      const parsedInput = askWorkspaceHarnessInputSchema.safeParse({
        caseId: formData.get("caseId"),
        question: formData.get("question"),
      });

      if (!parsedInput.success) {
        return {
          ok: false,
          errorCategory: "schema_validation",
          isRetryable: false,
          message: "Ask a question for the current case.",
        };
      }

      return askHarnessQuestion(parsedInput.data);
    },
  );
}
