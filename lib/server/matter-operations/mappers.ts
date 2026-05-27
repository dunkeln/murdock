import {
  matterOperationDtoSchema,
  matterOperationEventDtoSchema,
  type MatterOperationDto,
  type MatterOperationEventDto,
  type MatterOperationState,
} from "@/lib/contracts/matter-operations";
import {
  reviewWorkItemProvenanceRefSchema,
  reviewWorkItemSchema,
  type ReviewWorkItem,
  type ReviewWorkItemProvenanceRef,
} from "@/lib/contracts/review-work-item";
import { sourceSpanProvenanceRefs } from "@/lib/review-work-items";
import {
  caseReviewWorkItems,
  documentRevisionClaims,
  matterOperationEvents,
  matterOperations,
} from "@/lib/server/db/schema/matter-operations";

type DateValue = Date | string | null;
type MatterOperationRow = typeof matterOperations.$inferSelect;
type MatterOperationEventRow = typeof matterOperationEvents.$inferSelect;
type SourceReviewActionRow = typeof caseReviewWorkItems.$inferSelect;

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

function toProvenanceRefs(value: unknown): ReviewWorkItemProvenanceRef[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const parsed = reviewWorkItemProvenanceRefSchema.safeParse(item);

    return parsed.success ? [parsed.data] : [];
  });
}

function uniqueProvenanceRefs(
  refs: ReviewWorkItemProvenanceRef[],
): ReviewWorkItemProvenanceRef[] {
  const seen = new Set<string>();

  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.ref}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
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

export function revisionClaimState(status: string): MatterOperationState {
  return status === "dismissed" ? "dismissed" : "open";
}

export function reviewWorkItemFromActionRow(
  action: SourceReviewActionRow,
): ReviewWorkItem {
  const sourceSpanIds = toUuidArray(action.sourceSpanIds);
  const provenanceRefs = uniqueProvenanceRefs([
    ...toProvenanceRefs(action.provenanceRefs),
    ...sourceSpanProvenanceRefs(sourceSpanIds),
  ]);

  return reviewWorkItemSchema.parse({
    blocking: action.blocking,
    caseId: action.caseId,
    createdAt: toIsoDateTime(action.updatedAt),
    id: action.id,
    key: action.key,
    kind: {
      code: action.kind,
      family: action.kind,
    },
    origin: {
      sourceRunId: action.sourceRunId,
      sourceType: action.sourceType,
    },
    priority: action.priority,
    provenanceRefs,
    resolvedAt: null,
    reviewPrompt: action.reviewPrompt,
    sourceSpanIds,
    status: action.status,
    summary: action.summary,
    title: action.title,
    updatedAt: toIsoDateTime(action.updatedAt),
  });
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
