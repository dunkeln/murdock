import {
  CaseWorkspaceErrorState,
  CaseWorkspaceView,
} from "@/components/app/case-workspace";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { getCurrentUserCaseWorkspaceBySlug } from "@/lib/server/case-workspace/service";
import { getHarnessSourceRunStateByCase } from "@/lib/server/harness/persistence/repository";
import { shapeCurrentUserWorkspaceFromOcr } from "@/lib/server/workflows/shape/action";
import {
  maxAutoHarnessFailedRuns,
  partitionSourcesByHarnessState,
} from "@/lib/server/workflows/shape/source-selection";

type CaseDetailPageProps = {
  params: Promise<{
    caseId: string;
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

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
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

  return <CaseWorkspaceView workspace={result.workspace} />;
}
