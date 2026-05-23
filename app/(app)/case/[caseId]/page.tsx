import { getCaseTypeLabel } from "@/lib/case-type";
import { getCurrentUserCaseSummaryBySlug } from "@/lib/server/cases/service";

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
  const caseSummary = await getCurrentUserCaseSummaryBySlug(caseId);

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-4xl uppercase leading-none sm:text-5xl">
        {caseSummary?.title ?? formatCaseId(caseId)}
      </h1>
      <p className="text-sm font-medium text-paper/60">
        {caseSummary ? getCaseTypeLabel(caseSummary.type) : "General"}
      </p>
    </div>
  );
}
