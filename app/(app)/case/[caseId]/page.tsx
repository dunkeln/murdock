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

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-heading text-6xl uppercase leading-none">
        {formatCaseId(caseId)}
      </h1>
      <p className="text-sm font-medium text-paper/60">/{caseId}</p>
    </div>
  );
}
