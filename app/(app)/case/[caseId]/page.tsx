import {
  CaseWorkspaceErrorState,
  CaseWorkspaceView,
} from "@/components/app/case-workspace";
import { getCurrentUserCaseWorkspaceBySlug } from "@/lib/server/case-workspace/service";

type CaseDetailPageProps = {
  params: Promise<{
    caseId: string;
  }>;
};

function formatCaseId(caseId: string) {
  return decodeURIComponent(caseId).replaceAll("-", " ");
}

export default async function CaseDetailPage({ params }: CaseDetailPageProps) {
  const { caseId } = await params;
  const result = await getCurrentUserCaseWorkspaceBySlug(caseId);

  if (!result.ok) {
    return (
      <CaseWorkspaceErrorState
        error={result.error}
        fallbackTitle={formatCaseId(caseId)}
      />
    );
  }

  return <CaseWorkspaceView workspace={result.workspace} />;
}
