import "server-only";

import {
  matterOperationalSnapshotDtoSchema,
  type MatterOperationDto,
  type MatterOperationalSnapshotDto,
} from "@/lib/contracts/matter-operations";

import {
  listMatterOperationEventsByCaseId,
  listMatterOperationsByCaseId,
  projectReviewActionsToMatterOperations,
  projectRevisionClaimsToMatterOperations,
  recordMatterOperationEvent,
  supersedeOlderRevisionOperations,
} from "./repository";

function nowIso() {
  return new Date().toISOString();
}

function activeOperations(operations: MatterOperationDto[]) {
  return operations.filter(
    (operation) =>
      operation.current &&
      (operation.state === "open" || operation.state === "in_review"),
  );
}

function snapshotCounts(input: {
  activeOperations: MatterOperationDto[];
  operations: MatterOperationDto[];
  totalOperationCount: number;
}) {
  return {
    activeOperationCount: input.activeOperations.length,
    blockingActiveOperationCount: input.activeOperations.filter(
      (operation) => operation.blocking,
    ).length,
    currentOperationCount: input.operations.filter((operation) => operation.current)
      .length,
    dismissedOperationCount: input.operations.filter(
      (operation) => operation.state === "dismissed",
    ).length,
    ignoredOperationCount: input.operations.filter(
      (operation) => operation.state === "ignored",
    ).length,
    inReviewOperationCount: input.operations.filter(
      (operation) => operation.current && operation.state === "in_review",
    ).length,
    openOperationCount: input.operations.filter(
      (operation) => operation.current && operation.state === "open",
    ).length,
    resolvedOperationCount: input.operations.filter(
      (operation) => operation.state === "resolved",
    ).length,
    supersededOperationCount: input.operations.filter(
      (operation) => operation.state === "superseded",
    ).length,
    totalOperationCount: input.totalOperationCount,
    untrackedOperationCount: input.operations.filter(
      (operation) => operation.state === "untracked",
    ).length,
  };
}

export async function projectMatterOperationsForCase(input: {
  caseId: string;
}) {
  const [reviewOperations, revisionOperations] = await Promise.all([
    projectReviewActionsToMatterOperations(input),
    projectRevisionClaimsToMatterOperations(input),
  ]);
  const supersededOperations = await supersedeOlderRevisionOperations(input);

  return {
    reviewOperations,
    revisionOperations,
    supersededOperations,
  };
}

export async function getMatterOperationalSnapshot(input: {
  caseId: string;
  includeHistory?: boolean;
  projectBeforeRead?: boolean;
}): Promise<MatterOperationalSnapshotDto> {
  if (input.projectBeforeRead ?? true) {
    await projectMatterOperationsForCase({ caseId: input.caseId });
  }

  const [currentOperations, historyOperations] = await Promise.all([
    listMatterOperationsByCaseId({
      caseId: input.caseId,
      includeHistory: false,
    }),
    input.includeHistory
      ? listMatterOperationsByCaseId({
          caseId: input.caseId,
          includeHistory: true,
        })
      : Promise.resolve<MatterOperationDto[]>([]),
  ]);
  const operations = input.includeHistory ? historyOperations : currentOperations;
  const active = activeOperations(currentOperations);

  return matterOperationalSnapshotDtoSchema.parse({
    activeOperations: active,
    caseId: input.caseId,
    counts: snapshotCounts({
      activeOperations: active,
      operations,
      totalOperationCount: operations.length,
    }),
    currentOperations,
    generatedAt: nowIso(),
  });
}

export {
  listMatterOperationEventsByCaseId,
  listMatterOperationsByCaseId,
  recordMatterOperationEvent,
};
