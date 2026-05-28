import "server-only";

import {
  type CanonicalHarnessView,
  canonicalHarnessViewSchema,
} from "@/lib/contracts/harness-view";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type {
  MatterOperationEventDto,
  MatterOperationalSnapshotDto,
} from "@/lib/contracts/matter-operations";
import {
  type GetCurrentUserCaseWorkspaceResult,
  getCurrentUserCaseWorkspaceById,
  getCurrentUserCaseWorkspaceBySlug,
} from "@/lib/server/case-workspace/service";
import { getDocumentRevisionSummariesByCaseId } from "@/lib/server/revisions/repository";
import {
  getMatterOperationalSnapshot,
  listMatterOperationEventsByCaseId,
} from "@/lib/server/matter-operations/service";

export type GetCurrentUserHarnessViewResult =
  | {
      harnessView: CanonicalHarnessView;
      ok: true;
    }
  | Exclude<GetCurrentUserCaseWorkspaceResult, { ok: true }>;

export function buildCanonicalHarnessView(input: {
  matterSnapshot: MatterOperationalSnapshotDto;
  revisions: DocumentRevisionSummaryDto[];
  temporalEvents: MatterOperationEventDto[];
  workspace: CaseWorkspaceDto;
}): CanonicalHarnessView {
  return canonicalHarnessViewSchema.parse({
    case: input.workspace.case,
    chronologyEvents: input.workspace.chronologyEvents,
    diffs: input.revisions,
    facts: input.workspace.facts,
    finalMatter: input.matterSnapshot,
    issues: input.workspace.issues,
    reviewWorkItems: input.workspace.reviewWorkItems,
    sourceDocuments: input.workspace.sourceDocuments,
    sourceSpans: input.workspace.sourceSpans,
    temporalEvents: input.temporalEvents,
    temporalOperations: input.matterSnapshot.currentOperations,
  });
}

async function buildHarnessViewFromWorkspace(
  workspace: CaseWorkspaceDto,
): Promise<CanonicalHarnessView> {
  const [matterSnapshot, revisions, temporalEvents] = await Promise.all([
    getMatterOperationalSnapshot({
      caseId: workspace.case.id,
      includeHistory: true,
    }),
    getDocumentRevisionSummariesByCaseId({
      caseId: workspace.case.id,
    }),
    listMatterOperationEventsByCaseId({
      caseId: workspace.case.id,
    }),
  ]);

  return buildCanonicalHarnessView({
    matterSnapshot,
    revisions,
    temporalEvents,
    workspace,
  });
}

export async function getCurrentUserHarnessViewById(
  caseId: string,
): Promise<GetCurrentUserHarnessViewResult> {
  const workspaceResult = await getCurrentUserCaseWorkspaceById(caseId);

  if (!workspaceResult.ok) {
    return workspaceResult;
  }

  return {
    harnessView: await buildHarnessViewFromWorkspace(workspaceResult.workspace),
    ok: true,
  };
}

export async function getCurrentUserHarnessViewBySlug(
  slug: string,
): Promise<GetCurrentUserHarnessViewResult> {
  const workspaceResult = await getCurrentUserCaseWorkspaceBySlug(slug);

  if (!workspaceResult.ok) {
    return workspaceResult;
  }

  return {
    harnessView: await buildHarnessViewFromWorkspace(workspaceResult.workspace),
    ok: true,
  };
}
