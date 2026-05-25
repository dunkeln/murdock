import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { buildHarnessQueryContext } from "@/lib/harness-reflection";
import { generateObject } from "@/lib/server/ai/generate-object";
import { getCurrentUserCaseWorkspaceById } from "@/lib/server/case-workspace/service";

const promptPath = join(process.cwd(), "prompts", "workspace-query-v1.md");

const answerSchema = z.object({
  answer: z.string().min(1),
  sourceSpanIds: z.array(z.string().min(1)).default([]),
});

export type AskHarnessQuestionResult =
  | {
      answer: string;
      contextStats: {
        docCount: number;
        factCount: number;
        issueCount: number;
        sourceSpanCount: number;
      };
      model: string;
      ok: true;
      provider: string;
      sourceSpanIds: string[];
      usage: {
        inputTokens: number | null;
        outputTokens: number | null;
      };
    }
  | {
      errorCategory:
        | "configuration"
        | "not_found"
        | "provider"
        | "schema_validation"
        | "unavailable"
        | "unknown";
      isRetryable: boolean;
      message: string;
      ok: false;
    };

async function prompt() {
  return readFile(promptPath, "utf8");
}

export async function askHarnessQuestion(input: {
  caseId: string;
  question: string;
}): Promise<AskHarnessQuestionResult> {
  const workspaceResult = await getCurrentUserCaseWorkspaceById(input.caseId);

  if (!workspaceResult.ok) {
    return {
      ok: false,
      errorCategory:
        workspaceResult.error.errorCategory === "not_found"
          ? "not_found"
          : "unknown",
      isRetryable: workspaceResult.error.isRetryable,
      message: workspaceResult.error.message,
    };
  }

  const context = buildHarnessQueryContext(workspaceResult.workspace);

  if (!context.isLive) {
    return {
      ok: false,
      errorCategory: "unavailable",
      isRetryable: false,
      message:
        "No OCR-backed harness result is available for this case yet. Drop a document into the case first.",
    };
  }

  const result = await generateObject({
    allowFallback: false,
    maxOutputTokens: 900,
    messages: [
      {
        role: "user",
        content: JSON.stringify(
          {
            question: input.question,
            harnessContext: context,
          },
          null,
          2,
        ),
      },
    ],
    preferredProvider: "anthropic",
    schema: answerSchema,
    schemaDescription:
      "Answer the user question from the harness context with source span IDs.",
    schemaName: "murdock_workspace_query_v1",
    system: await prompt(),
    temperature: 0,
    use: "workspace-query",
  });

  if (!result.ok) {
    return {
      ok: false,
      errorCategory:
        result.error.errorCategory === "configuration"
          ? "configuration"
          : result.error.errorCategory === "schema_validation"
            ? "schema_validation"
            : "provider",
      isRetryable: result.error.isRetryable,
      message: result.error.message,
    };
  }

  return {
    ok: true,
    answer: result.data.answer,
    contextStats: {
      docCount: context.stats.docCount,
      factCount: context.stats.factCount,
      issueCount: context.stats.issueCount,
      sourceSpanCount: context.stats.sourceSpanCount,
    },
    model: result.model,
    provider: result.provider,
    sourceSpanIds: result.data.sourceSpanIds,
    usage: result.usage,
  };
}
