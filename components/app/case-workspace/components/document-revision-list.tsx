"use client";

import * as React from "react";

import type {
  DocumentRevisionClaimDto,
  DocumentRevisionSummaryDto,
  RevisionChangeType,
} from "@/lib/contracts/document-revisions";
import { cn } from "@/lib/utils";

type DocumentRevisionListProps = {
  activeClaimId?: string | null;
  className?: string;
  onSelectClaim?: (claimId: string) => void;
  revisions: DocumentRevisionSummaryDto[];
};

const MAX_VISIBLE_REVISIONS = 4;
const MAX_VISIBLE_VALUE_LENGTH = 72;

function ellipsize(value: string, maxLength = MAX_VISIBLE_VALUE_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function valueCopy(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return "Not stated";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidate =
      record.statedValue ??
      record.normalizedValue ??
      record.title ??
      record.description ??
      record.provenanceSummary;

    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  return "Updated";
}

function changeLabel(changeType: RevisionChangeType) {
  switch (changeType) {
    case "added":
      return "Added";
    case "removed":
      return "Removed";
    case "unchanged_with_new_source":
      return "New support";
    case "changed":
    default:
      return "Changed";
  }
}

function claimOrderScore(claim: DocumentRevisionClaimDto) {
  const isFact = claim.fieldPath.startsWith("facts.");

  if (isFact && claim.changeType === "changed") {
    return 0;
  }

  if (isFact && claim.changeType === "added") {
    return 1;
  }

  if (isFact && claim.changeType === "removed") {
    return 2;
  }

  if (claim.changeType === "changed") {
    return 3;
  }

  if (claim.changeType === "added" || claim.changeType === "removed") {
    return 4;
  }

  return 5;
}

function orderedClaims(revisions: DocumentRevisionSummaryDto[]) {
  return revisions
    .flatMap((revision) =>
      revision.claims.map((claim) => ({
        claim,
        revision,
      })),
    )
    .sort((left, right) => {
      const scoreDelta = claimOrderScore(left.claim) - claimOrderScore(right.claim);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return left.claim.fieldLabel.localeCompare(right.claim.fieldLabel);
    })
    .slice(0, MAX_VISIBLE_REVISIONS);
}

export function DocumentRevisionList({
  activeClaimId,
  className,
  onSelectClaim,
  revisions,
}: DocumentRevisionListProps) {
  const items = orderedClaims(revisions);
  const [expandedClaimId, setExpandedClaimId] = React.useState<string | null>(null);

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      aria-label="Document updates"
      className={cn("flex min-w-0 flex-col gap-2 text-paper", className)}
    >
      <div className="sticky top-0 z-10 min-w-0 bg-ink px-2 pb-1">
        <h2 className="font-heading text-sm uppercase leading-tight">
          Document updates
        </h2>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {items.map(({ claim }) => {
          const isActive = claim.id === activeClaimId;
          const isExpanded = claim.id === (activeClaimId ?? expandedClaimId);

          return (
            <article
              aria-label={`Document update: ${claim.fieldLabel}`}
              className={cn(
                "min-w-0 bg-ink text-paper outline-none transition-colors",
                isActive
                  ? "text-paper"
                  : "text-paper/70 hover:bg-ink hover:text-paper",
              )}
              data-active={isActive}
              data-document-revision-claim={claim.id}
              key={claim.id}
            >
              <button
                aria-label={`Show document update: ${claim.fieldLabel}`}
                aria-expanded={isExpanded}
                aria-pressed={isActive}
                className="flex w-full min-w-0 flex-col gap-2.5 p-2.5 text-left"
                onClick={() => {
                  onSelectClaim?.(claim.id);
                  setExpandedClaimId((currentClaimId) =>
                    currentClaimId === claim.id ? null : claim.id,
                  );
                }}
                type="button"
              >
                <span className="flex min-w-0 items-start gap-2">
                  <span className="mt-0.5 shrink-0 font-heading text-[0.625rem] uppercase leading-none text-current/45">
                    {changeLabel(claim.changeType)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-heading text-xs uppercase leading-tight text-current">
                      {claim.fieldLabel}
                    </span>
                  </span>
                </span>
                {isExpanded ? (
                  <span className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-2 text-[0.6875rem] leading-4">
                    <span
                      className="min-w-0 break-words text-current/50"
                      title={valueCopy(claim.beforeValue)}
                    >
                      {ellipsize(valueCopy(claim.beforeValue))}
                    </span>
                    <span aria-hidden="true" className="font-heading text-current/35">
                      TO
                    </span>
                    <span
                      className="min-w-0 break-words text-current/85"
                      title={valueCopy(claim.afterValue)}
                    >
                      {ellipsize(valueCopy(claim.afterValue))}
                    </span>
                  </span>
                ) : null}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
