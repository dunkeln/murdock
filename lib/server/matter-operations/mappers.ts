import {
  matterOperationDtoSchema,
  matterOperationEventDtoSchema,
  type MatterOperationDto,
  type MatterOperationEventDto,
  type MatterOperationState,
} from "@/lib/contracts/matter-operations";
import {
  caseReviewActions,
  documentRevisionClaims,
  matterOperationEvents,
  matterOperations,
} from "@/lib/server/db/schema/matter-operations";

type DateValue = Date | string | null;
type MatterOperationRow = typeof matterOperations.$inferSelect;
type MatterOperationEventRow = typeof matterOperationEvents.$inferSelect;
type SourceReviewActionRow = typeof caseReviewActions.$inferSelect;

export type SourceRevisionClaimWithVersions =
  typeof documentRevisionClaims.$inferSelect & {
    fromSnapshotHash: string;
    fromVersionIndex: number;
    toSnapshotHash: string;
    toVersionIndex: number;
  };

function toIsoDateTime(value: Date | string): string;
function toIsoDateTime(value: DateValue): string | null;
function toIsoDateTime(value: DateValue): string | null {
  if (value === null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toUuidArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  return value
    .replace(/[{}]/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toMatterOperationDto(row: MatterOperationRow): MatterOperationDto {
  return matterOperationDtoSchema.parse({
    blocking: row.blocking,
    caseId: row.caseId,
    createdAt: toIsoDateTime(row.createdAt),
    current: row.current,
    id: row.id,
    operationKey: row.operationKey,
    previousSourceHash: row.previousSourceHash,
    priority: row.priority,
    provenanceRefs: row.provenanceRefs,
    requiredCapability: row.requiredCapability,
    sourceHash: row.sourceHash,
    sourceId: row.sourceId,
    sourceRunId: row.sourceRunId,
    sourceType: row.sourceType,
    state: row.state,
    summary: row.summary,
    supersededByOperationId: row.supersededByOperationId,
    title: row.title,
    updatedAt: toIsoDateTime(row.updatedAt),
  });
}

export function toMatterOperationEventDto(
  row: MatterOperationEventRow,
): MatterOperationEventDto {
  return matterOperationEventDtoSchema.parse({
    actorId: row.actorId,
    caseId: row.caseId,
    createdAt: toIsoDateTime(row.createdAt),
    eventKey: row.eventKey,
    eventType: row.eventType,
    id: row.id,
    metadata: row.metadata,
    note: row.note,
    operationId: row.operationId,
  });
}

export function reviewActionState(status: string): MatterOperationState {
  if (status === "resolved" || status === "dismissed") {
    return status;
  }

  return "open";
}

export function revisionClaimState(status: string): MatterOperationState {
  return status === "dismissed" ? "dismissed" : "open";
}

export function reviewActionProvenance(action: SourceReviewActionRow) {
  return [
    ...toUuidArray(action.sourceSpanIds).map((sourceSpanId) => ({
      kind: "source_span",
      label: null,
      ref: sourceSpanId,
    })),
    ...(Array.isArray(action.rawRefs) ? action.rawRefs : []).flatMap((ref) => {
      if (
        typeof ref !== "object" ||
        ref === null ||
        !("kind" in ref) ||
        !("id" in ref)
      ) {
        return [];
      }

      return [
        {
          kind: String(ref.kind),
          label:
            "label" in ref && typeof ref.label === "string" ? ref.label : null,
          ref: String(ref.id),
        },
      ];
    }),
  ];
}

export function revisionClaimProvenance(claim: SourceRevisionClaimWithVersions) {
  return [
    {
      kind: "document_family",
      label: null,
      ref: claim.documentFamilyId,
    },
    {
      kind: "from_document_version",
      label: `v${claim.fromVersionIndex}`,
      ref: claim.fromDocumentVersionId,
    },
    {
      kind: "to_document_version",
      label: `v${claim.toVersionIndex}`,
      ref: claim.toDocumentVersionId,
    },
    ...toUuidArray(claim.afterSourceSpanIds).map((sourceSpanId) => ({
      kind: "source_span",
      label: null,
      ref: sourceSpanId,
    })),
  ];
}
