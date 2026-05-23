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
      <p className="text-sm font-medium text-paper/60">Computed case route</p>
      <h1 className="font-heading text-6xl uppercase leading-none">
        {formatCaseId(caseId)}
      </h1>
      <p className="max-w-2xl text-paper/70">
        Placeholder case workspace for route slug `{caseId}`.
      </p>
    </div>
  );
}
