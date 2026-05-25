import type { CaseWorkspaceServiceError } from "@/lib/contracts/case-workspace";

type CaseWorkspaceErrorStateProps = {
  error: CaseWorkspaceServiceError;
  fallbackTitle: string;
};

export function CaseWorkspaceErrorState({
  error,
  fallbackTitle,
}: CaseWorkspaceErrorStateProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-5xl uppercase leading-none sm:text-6xl">
        {fallbackTitle}
      </h1>
      <div className="max-w-2xl border border-paper/15 p-4 text-sm text-paper/70">
        <p className="font-medium text-paper">{error.message}</p>
        <p className="mt-2 uppercase text-paper/45">
          {error.errorCategory} · {error.isRetryable ? "Retryable" : "Blocked"}
        </p>
      </div>
    </div>
  );
}
