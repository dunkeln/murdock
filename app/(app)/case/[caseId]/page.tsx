import {
  CaseWorkspaceErrorState,
  CaseWorkspaceView,
} from "@/components/app/case-workspace";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { getCurrentUserCaseWorkspaceBySlug } from "@/lib/server/case-workspace/service";
import { getHarnessSourceRunStateByCase } from "@/lib/server/harness/persistence/repository";
import { getDocumentRevisionSummariesByCaseId } from "@/lib/server/revisions/repository";
import { shapeCurrentUserWorkspaceFromOcr } from "@/lib/server/workflows/shape/action";
import {
  maxAutoHarnessFailedRuns,
  partitionSourcesByHarnessState,
} from "@/lib/server/workflows/shape/source-selection";
import { selectedHarnessVersion } from "@/lib/server/workflows/shape/version";

type CaseDetailPageProps = {
  params: Promise<{
    caseId: string;
  }>;
  searchParams?: Promise<{
    source?: string | string[];
  }>;
};

function formatCaseId(caseId: string) {
  return decodeURIComponent(caseId).replaceAll("-", " ");
}

async function eagerRunHarnessForReadyDocuments(workspace: CaseWorkspaceDto) {
  const readySources = workspace.sourceDocuments.flatMap((document) =>
    document.ocrStatus === "ready" && document.ocrConversionId
      ? [
          {
            caseDocumentId: document.caseDocumentId,
            fileName: document.fileName,
            ocrConversionId: document.ocrConversionId,
            sourceKey: document.sourceKey,
          },
        ]
      : [],
  );

  if (readySources.length === 0) {
    return false;
  }

  const harnessState = await getHarnessSourceRunStateByCase({
    caseId: workspace.case.id,
    harnessVersion: selectedHarnessVersion(),
    sourceKeys: readySources.map((source) => source.sourceKey),
  });
  const { sourcesToShape } = partitionSourcesByHarnessState(
    readySources,
    harnessState,
    { maxFailedRuns: maxAutoHarnessFailedRuns() },
  );

  if (sourcesToShape.length === 0) {
    return false;
  }

  await shapeCurrentUserWorkspaceFromOcr({
    caseId: workspace.case.id,
    files: sourcesToShape.map((source) => ({
      caseDocumentId: source.caseDocumentId,
      fileName: source.fileName,
      ocrConversionId: source.ocrConversionId,
    })),
  });

  return true;
}

function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CaseDetailPage({
  params,
  searchParams,
}: CaseDetailPageProps) {
  const { caseId } = await params;
  const resolvedSearchParams = await searchParams;
  const previewedSourceKey = firstSearchParam(resolvedSearchParams?.source);
  let result = await getCurrentUserCaseWorkspaceBySlug(caseId);

  if (!result.ok) {
    return (
      <CaseWorkspaceErrorState
        error={result.error}
        fallbackTitle={formatCaseId(caseId)}
      />
    );
  }

  const didAutoRunHarness = await eagerRunHarnessForReadyDocuments(result.workspace);

  if (didAutoRunHarness) {
    result = await getCurrentUserCaseWorkspaceBySlug(caseId);

    if (!result.ok) {
      return (
        <CaseWorkspaceErrorState
          error={result.error}
          fallbackTitle={formatCaseId(caseId)}
        />
      );
    }
  }

  const documentRevisions = await getDocumentRevisionSummariesByCaseId({
    caseId: result.workspace.case.id,
  });

  return (
    <CaseWorkspaceView
      documentRevisions={documentRevisions}
      initialPreviewedSourceKey={previewedSourceKey}
      workspace={result.workspace}
    />
  );
}
