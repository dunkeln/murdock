import type { CaseWorkspaceSourceSpanDto } from "@/lib/contracts/case-workspace";

export function formatWorkspaceDate(value: string | null): string {
  if (!value) {
    return "Undated";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatWorkspaceConfidence(value: number | null): string {
  if (value === null) {
    return "Unscored";
  }

  return `${Math.round(value * 100)}%`;
}

export function getSourceSpanCitationLabel(
  span: CaseWorkspaceSourceSpanDto
): string {
  const parts = [
    span.pageLabel ? `p. ${span.pageLabel}` : null,
    span.fieldPath,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" · ") : "Source span";
}
