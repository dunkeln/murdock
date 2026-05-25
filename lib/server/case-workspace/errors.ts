import type { CaseWorkspaceServiceError } from "@/lib/contracts/case-workspace";
import { caseWorkspaceServiceErrorSchema } from "@/lib/contracts/case-workspace";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

export function toCaseWorkspaceServiceError(
  error: unknown
): CaseWorkspaceServiceError {
  const message = getErrorMessage(error);

  if (message.includes("NEON_CONN_URL")) {
    return caseWorkspaceServiceErrorSchema.parse({
      isError: true,
      errorCategory: "configuration",
      isRetryable: false,
      message: "Workspace data requires database configuration.",
    });
  }

  if (message.includes("does not exist") || message.includes("relation")) {
    return caseWorkspaceServiceErrorSchema.parse({
      isError: true,
      errorCategory: "database",
      isRetryable: false,
      message: "Workspace tables are not available. Run database migrations.",
    });
  }

  return caseWorkspaceServiceErrorSchema.parse({
    isError: true,
    errorCategory: "unknown",
    isRetryable: true,
    message: "Case workspace could not be loaded.",
  });
}
