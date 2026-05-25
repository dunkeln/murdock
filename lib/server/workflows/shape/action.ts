import "server-only";

import { randomUUID } from "node:crypto";

import { getCurrentUser } from "@/lib/server/auth/current-user";
import { getCaseSummaryByUserAndId } from "@/lib/server/cases/repository";
import { getCurrentUserCaseWorkspaceById } from "@/lib/server/case-workspace/service";
import { getOcrConversionsByFirmAndIds } from "@/lib/server/documents/ocr-conversions-repository";
import { runError, runStarted, stepFinished, stepStarted } from "@/lib/server/agui/events";
import { workspaceReadyEvents } from "@/lib/server/agui/workspace";
import { withLangfuseObservation } from "@/lib/server/telemetry/langfuse";
import { persistShape } from "@/lib/server/workflows/shape/persist";
import { shapeFromOcr, type SourceInput } from "@/lib/server/workflows/shape/project";
import {
  errorSchema,
  getSourceKey,
  inputSchema,
  toShapeError,
  type ShapeError,
  type ShapeInput,
  type ShapeResult,
} from "@/lib/server/workflows/shape/schema";

function threadId(caseId: string) {
  return `case:${caseId}:workspace-control`;
}

function fail(input: {
  caseId: string;
  error: ShapeError;
  runId: string;
  startedEvents: ShapeResult["events"];
}): ShapeResult {
  return {
    ok: false,
    caseId: input.caseId,
    events: [
      ...input.startedEvents,
      runError({ code: input.error.errorCategory, message: input.error.message }),
    ],
    error: input.error,
    runId: input.runId,
    status: "failed",
  };
}

function notReady(caseId: string, runId: string, startedEvents: ShapeResult["events"]) {
  return fail({
    caseId,
    runId,
    startedEvents,
    error: errorSchema.parse({
      isError: true,
      errorCategory: "ocr_not_ready",
      isRetryable: true,
      message: "OCR must be ready before workspace shaping can run.",
    }),
  });
}

export async function shapeCurrentUserWorkspaceFromOcr(
  input: ShapeInput,
): Promise<ShapeResult> {
  const parsed = inputSchema.parse(input);
  const runId = randomUUID();
  const startedEvents = [
    runStarted({ caseId: parsed.caseId, runId, threadId: threadId(parsed.caseId) }),
    stepStarted("ocr-ready"),
  ];

  return withLangfuseObservation(
    {
      name: "workspace.shape-from-ocr",
      input: { caseId: parsed.caseId, fileCount: parsed.files.length },
      output: (result) => ({
        ok: result.ok,
        status: result.status,
        errorCategory: result.ok ? null : result.error.errorCategory,
        eventCount: result.events.length,
      }),
    },
    async () => {
      try {
        const user = await getCurrentUser();
        const caseSummary = await getCaseSummaryByUserAndId({
          caseId: parsed.caseId,
          userId: user.id,
        });

        if (!caseSummary) {
          return fail({
            caseId: parsed.caseId,
            runId,
            startedEvents,
            error: errorSchema.parse({
              isError: true,
              errorCategory: "not_found",
              isRetryable: false,
              message: "Case not found.",
            }),
          });
        }

        const conversions = await getOcrConversionsByFirmAndIds({
          conversionIds: parsed.files.map((file) => file.ocrConversionId),
          firmId: user.firmId,
        });
        const byId = new Map(conversions.map((conversion) => [conversion.id, conversion]));
        const sources: SourceInput[] = parsed.files.flatMap((file) => {
          const conversion = byId.get(file.ocrConversionId);

          return conversion
            ? [{ conversion, fileName: file.fileName, sourceKey: getSourceKey(conversion.id) }]
            : [];
        });

        if (
          sources.length !== parsed.files.length ||
          sources.some((source) => source.conversion.status !== "ready")
        ) {
          return notReady(parsed.caseId, runId, startedEvents);
        }

        const shape = await shapeFromOcr({ caseId: parsed.caseId, sources });
        if ("isError" in shape) {
          return fail({ caseId: parsed.caseId, runId, startedEvents, error: shape });
        }

        await persistShape({ caseId: parsed.caseId, shape, sources });
        const workspace = await getCurrentUserCaseWorkspaceById(parsed.caseId);

        if (!workspace.ok) {
          return fail({
            caseId: parsed.caseId,
            runId,
            startedEvents,
            error: errorSchema.parse({
              isError: true,
              errorCategory: workspace.error.errorCategory,
              isRetryable: workspace.error.isRetryable,
              message: workspace.error.message,
            }),
          });
        }

        return {
          ok: true,
          caseId: parsed.caseId,
          events: [
            ...startedEvents,
            stepFinished("ocr-ready"),
            ...workspaceReadyEvents({
              runId,
              threadId: threadId(parsed.caseId),
              workspace: workspace.workspace,
            }).slice(3),
          ],
          runId,
          status: workspace.workspace.issues.some((issue) => issue.status === "open")
            ? "needs_review"
            : "ready",
        };
      } catch (error) {
        return fail({
          caseId: parsed.caseId,
          runId,
          startedEvents,
          error: toShapeError(error),
        });
      }
    },
  );
}
