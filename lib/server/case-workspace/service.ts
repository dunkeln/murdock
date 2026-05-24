import "server-only";

import {
  type CaseWorkspaceDto,
  type CaseWorkspaceServiceError,
  caseWorkspaceDtoSchema,
  caseWorkspaceServiceErrorSchema,
} from "@/lib/contracts/case-workspace";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import { getCaseSummaryByUserAndSlug } from "@/lib/server/cases/repository";
import { toCaseWorkspaceServiceError } from "@/lib/server/case-workspace/errors";
import { getCaseWorkspaceRecordsByCaseId } from "@/lib/server/case-workspace/repository";
import {
  withLangfuseObservation,
  withLangfuseTrace,
} from "@/lib/server/telemetry/langfuse";

export type GetCurrentUserCaseWorkspaceResult =
  | {
      ok: true;
      workspace: CaseWorkspaceDto;
    }
  | {
      error: CaseWorkspaceServiceError;
      ok: false;
    };

export async function getCurrentUserCaseWorkspaceBySlug(
  slug: string
): Promise<GetCurrentUserCaseWorkspaceResult> {
  return withLangfuseObservation(
    {
      name: "case-workspace.load",
      input: { slug },
      metadata: {
        workspaceSlug: slug,
      },
      output: (result) => ({
        ok: result.ok,
        errorCategory: result.ok ? null : result.error.errorCategory,
      }),
    },
    async () => {
      try {
        const user = await getCurrentUser();

        return await withLangfuseTrace(
          {
            name: "case-workspace.load-for-user",
            userId: user.id,
            sessionId: `case:${slug}`,
            tags: ["case-workspace", "provenance"],
            input: { slug },
            metadata: {
              firmId: user.firmId,
              workspaceSlug: slug,
            },
            output: (result) => ({
              ok: result.ok,
              sourceDocuments: result.ok
                ? result.workspace.sourceDocuments.length
                : 0,
              sourceSpans: result.ok ? result.workspace.sourceSpans.length : 0,
              facts: result.ok ? result.workspace.facts.length : 0,
              chronologyEvents: result.ok
                ? result.workspace.chronologyEvents.length
                : 0,
              issues: result.ok ? result.workspace.issues.length : 0,
              errorCategory: result.ok ? null : result.error.errorCategory,
            }),
          },
          async () => loadCaseWorkspaceForUser({ slug, userId: user.id })
        );
      } catch (error) {
        return {
          ok: false,
          error: toCaseWorkspaceServiceError(error),
        };
      }
    }
  );
}

async function loadCaseWorkspaceForUser(input: {
  slug: string;
  userId: string;
}): Promise<GetCurrentUserCaseWorkspaceResult> {
  const caseSummary = await withLangfuseObservation(
    {
      name: "case-workspace.case-summary",
      input: { slug: input.slug },
      metadata: {
        workspaceSlug: input.slug,
      },
      output: (caseSummaryResult) => ({
        found: Boolean(caseSummaryResult),
        caseId: caseSummaryResult?.id ?? null,
        status: caseSummaryResult?.status ?? null,
      }),
    },
    () =>
      getCaseSummaryByUserAndSlug({
        userId: input.userId,
        slug: input.slug,
      })
  );

  if (!caseSummary) {
    return {
      ok: false,
      error: caseWorkspaceServiceErrorSchema.parse({
        isError: true,
        errorCategory: "not_found",
        isRetryable: false,
        message: "Case not found.",
      }),
    };
  }

  const records = await withLangfuseObservation(
    {
      name: "case-workspace.records",
      input: {
        caseId: caseSummary.id,
      },
      metadata: {
        caseId: caseSummary.id,
        workspaceSlug: input.slug,
      },
      output: (recordsResult) => ({
        sourceDocuments: recordsResult.sourceDocuments.length,
        sourceSpans: recordsResult.sourceSpans.length,
        facts: recordsResult.facts.length,
        chronologyEvents: recordsResult.chronologyEvents.length,
        issues: recordsResult.issues.length,
      }),
    },
    () =>
      getCaseWorkspaceRecordsByCaseId({
        caseId: caseSummary.id,
      })
  );

  return {
    ok: true,
    workspace: caseWorkspaceDtoSchema.parse({
      case: caseSummary,
      sourceDocuments: records.sourceDocuments,
      sourceSpans: records.sourceSpans,
      facts: records.facts,
      chronologyEvents: records.chronologyEvents,
      issues: records.issues,
      generatedAt: new Date().toISOString(),
    }),
  };
}
