import "server-only";

import { randomUUID } from "node:crypto";

import { HARNESS_VERSION } from "@/lib/contracts/harness";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import { getCaseSummaryByUserAndId } from "@/lib/server/cases/repository";
import { getCurrentUserCaseWorkspaceById } from "@/lib/server/case-workspace/service";
import { getOcrConversionsByFirmAndIds } from "@/lib/server/documents/ocr-conversions-repository";
import { runError, runStarted, stepFinished, stepStarted } from "@/lib/server/agui/events";
import { workspaceReadyEvents } from "@/lib/server/agui/workspace";
import {
  finishHarnessRun,
  recordHarnessRunArtifact,
  recordHarnessRunSources,
  recordHarnessRunStepFinished,
  recordHarnessRunStepStarted,
  startHarnessRun,
} from "@/lib/server/harness/persistence/repository";
import { withLangfuseObservation } from "@/lib/server/telemetry/langfuse";
import { persistShape } from "@/lib/server/workflows/shape/persist";
import {
  shapeFromOcr,
  type HarnessBundleResult,
  type SourceInput,
} from "@/lib/server/workflows/shape/project";
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

function runStats(input: {
  bundles: HarnessBundleResult[];
  shapeIssueCount?: number;
  sourceCount: number;
}) {
  return {
    conflictCount: input.bundles.reduce(
      (count, result) => count + result.bundle.stats.conflictCount,
      0,
    ),
    docCount: input.bundles.reduce(
      (count, result) => count + result.bundle.stats.docCount,
      0,
    ),
    findingCount: input.bundles.reduce(
      (count, result) => count + result.bundle.stats.findingCount,
      0,
    ),
    gateCount: input.bundles.reduce(
      (count, result) => count + result.bundle.stats.gateCount,
      0,
    ),
    sourceCount: input.sourceCount,
    spanCount: input.bundles.reduce(
      (count, result) => count + result.bundle.stats.spanCount,
      0,
    ),
    workspaceIssueCount: input.shapeIssueCount ?? null,
  };
}

function runBundleArtifact(bundles: HarnessBundleResult[]) {
  return {
    bundles: bundles.map((result) => ({
      bundle: result.bundle,
      sourceKey: result.source.sourceKey,
    })),
    version: HARNESS_VERSION,
  };
}

function aggregateUsage(bundles: HarnessBundleResult[]) {
  return {
    inputTokens: bundles.reduce(
      (count, result) => count + (result.usage.inputTokens ?? 0),
      0,
    ),
    outputTokens: bundles.reduce(
      (count, result) => count + (result.usage.outputTokens ?? 0),
      0,
    ),
  };
}

function sameOrMixed(values: string[]) {
  const uniqueValues = [...new Set(values)];

  return uniqueValues.length === 1 ? uniqueValues[0]! : "mixed";
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
      let harnessRunStarted = false;

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
            ? [
                {
                  caseDocumentId: file.caseDocumentId ?? null,
                  conversion,
                  fileName: file.fileName,
                  sourceKey: getSourceKey(conversion.id),
                },
              ]
            : [];
        });

        if (
          sources.length !== parsed.files.length ||
          sources.some((source) => source.conversion.status !== "ready")
        ) {
          const notReadyError = errorSchema.parse({
            isError: true,
            errorCategory: "ocr_not_ready",
            isRetryable: true,
            message: "OCR must be ready before workspace shaping can run.",
          });
          const result = fail({
            caseId: parsed.caseId,
            error: notReadyError,
            runId,
            startedEvents,
          });
          await finishHarnessRun({
            error: notReadyError,
            finalStatus: "failed",
            runId,
            stats: { sourceCount: sources.length },
          });

          return result;
        }

        const existingWorkspace = await getCurrentUserCaseWorkspaceById(parsed.caseId);

        if (!existingWorkspace.ok) {
          return fail({
            caseId: parsed.caseId,
            runId,
            startedEvents,
            error: errorSchema.parse({
              isError: true,
              errorCategory: existingWorkspace.error.errorCategory,
              isRetryable: existingWorkspace.error.isRetryable,
              message: existingWorkspace.error.message,
            }),
          });
        }

        const existingSourceKeys = new Set(
          existingWorkspace.workspace.sourceDocuments.map((document) => document.sourceKey),
        );
        const sourcesToShape = sources.filter(
          (source) => !existingSourceKeys.has(source.sourceKey),
        );

        if (sourcesToShape.length === 0) {
          const status = existingWorkspace.workspace.issues.some(
            (issue) => issue.status === "open",
          )
            ? "needs_review"
            : "ready";

          return {
            ok: true,
            caseId: parsed.caseId,
            events: [
              ...startedEvents,
              stepFinished("ocr-ready"),
              ...workspaceReadyEvents({
                runId,
                threadId: threadId(parsed.caseId),
                workspace: existingWorkspace.workspace,
              }).slice(3),
            ],
            runId,
            status,
          };
        }

        await startHarnessRun({
          caseId: parsed.caseId,
          fileCount: sourcesToShape.length,
          firmId: user.firmId,
          runId,
        });
        harnessRunStarted = true;
        await recordHarnessRunSources({
          caseId: parsed.caseId,
          runId,
          sources: sourcesToShape.map((source) => ({
            documentSha256: source.conversion.documentSha256,
            fileName: source.fileName,
            ocrConversionId: source.conversion.id,
            pagesProcessed: source.conversion.pagesProcessed,
            provider: source.conversion.provider,
            providerModel: source.conversion.providerModel,
            sourceKey: source.sourceKey,
          })),
        });

        const shapeResult = await shapeFromOcr({
          caseId: parsed.caseId,
          observerForSource: (source) => ({
            onArtifact: (event) =>
              recordHarnessRunArtifact({
                artifact: event.artifact,
                caseId: parsed.caseId,
                kind: event.kind,
                ordinal: event.ordinal,
                runId,
                sourceKey: source.sourceKey,
                status: event.status,
                stepName: event.stepName,
                summary: event.summary,
              }),
            onStepFinished: (event) =>
              recordHarnessRunStepFinished({
                caseId: parsed.caseId,
                error: event.error,
                metrics: event.metrics,
                ordinal: event.ordinal,
                runId,
                sourceKey: source.sourceKey,
                status: event.status,
                stepName: event.stepName,
              }),
            onStepStarted: (event) =>
              recordHarnessRunStepStarted({
                caseId: parsed.caseId,
                ordinal: event.ordinal,
                runId,
                sourceKey: source.sourceKey,
                stepName: event.stepName,
              }),
          }),
          sources: sourcesToShape,
        });
        if ("isError" in shapeResult) {
          await finishHarnessRun({
            error: shapeResult,
            finalStatus: "failed",
            runId,
            stats: { sourceCount: sourcesToShape.length },
          });

          return fail({ caseId: parsed.caseId, runId, startedEvents, error: shapeResult });
        }

        await recordHarnessRunArtifact({
          artifact: shapeResult.shape,
          caseId: parsed.caseId,
          kind: "workspace_shape",
          ordinal: 1000,
          runId,
          sourceKey: null,
          status: "succeeded",
          stepName: "workspace-shape",
          summary: {
            actionCount: shapeResult.shape.controlActions.length,
            factCount: shapeResult.shape.facts.length,
            issueCount: shapeResult.shape.issues.length,
            sourceSpanCount: shapeResult.shape.sourceSpans.length,
          },
        });

        await persistShape({
          caseId: parsed.caseId,
          shape: shapeResult.shape,
          sources: sourcesToShape,
        });
        const workspace = await getCurrentUserCaseWorkspaceById(parsed.caseId);

        if (!workspace.ok) {
          const workspaceError = errorSchema.parse({
            isError: true,
            errorCategory: workspace.error.errorCategory,
            isRetryable: workspace.error.isRetryable,
            message: workspace.error.message,
          });
          const result = fail({
            caseId: parsed.caseId,
            runId,
            startedEvents,
            error: workspaceError,
          });
          await finishHarnessRun({
            error: workspaceError,
            finalBundle: runBundleArtifact(shapeResult.bundles),
            finalShape: shapeResult.shape,
            finalStatus: "failed",
            model: sameOrMixed(shapeResult.bundles.map((bundle) => bundle.model)),
            provider: sameOrMixed(shapeResult.bundles.map((bundle) => bundle.provider)),
            runId,
            stats: runStats({
              bundles: shapeResult.bundles,
              shapeIssueCount: shapeResult.shape.issues.length,
              sourceCount: sourcesToShape.length,
            }),
            usage: aggregateUsage(shapeResult.bundles),
          });

          return result;
        }

        const status = workspace.workspace.issues.some((issue) => issue.status === "open")
          ? "needs_review"
          : "ready";
        await finishHarnessRun({
          finalBundle: runBundleArtifact(shapeResult.bundles),
          finalShape: shapeResult.shape,
          finalStatus: status,
          model: sameOrMixed(shapeResult.bundles.map((bundle) => bundle.model)),
          provider: sameOrMixed(shapeResult.bundles.map((bundle) => bundle.provider)),
          runId,
          stats: runStats({
            bundles: shapeResult.bundles,
            shapeIssueCount: shapeResult.shape.issues.length,
            sourceCount: sourcesToShape.length,
          }),
          usage: aggregateUsage(shapeResult.bundles),
        });

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
          status,
        };
      } catch (error) {
        const shapeError = toShapeError(error);

        if (harnessRunStarted) {
          try {
            await finishHarnessRun({
              error: shapeError,
              finalStatus: "failed",
              runId,
              stats: {},
            });
          } catch {
            // Preserve the original shaping error for the action response.
          }
        }

        return fail({
          caseId: parsed.caseId,
          runId,
          startedEvents,
          error: shapeError,
        });
      }
    },
  );
}
