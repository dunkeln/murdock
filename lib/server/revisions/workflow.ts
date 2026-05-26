import "server-only";

import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";

import { mapDiffsToRevisionClaims } from "./claims";
import { diffRevisionSnapshots } from "./diff-engine";
import {
  getPreviousDocumentVersion,
  upsertDocumentFamily,
  upsertDocumentRevisionClaims,
  upsertDocumentVersion,
} from "./repository";
import { serializeRevisionSnapshot } from "./serialize";
import { buildRevisionSnapshot, type RevisionSnapshot } from "./snapshot";

function normalizeFamilyKey(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const normalized = withoutExtension
    .toLowerCase()
    .replace(/\b(?:v|version|rev|revision)[-_ ]*\d+\b/g, "")
    .replace(/\b\d{4}[-_ ]\d{2}[-_ ]\d{2}\b/g, "")
    .replace(/\b\d{8}\b/g, "")
    .replace(/\b(?:copy|final|draft)\b/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || withoutExtension.toLowerCase() || "document";
}

function revisionLabel(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || fileName;
}

function snapshotFromStoredJson(value: Record<string, unknown>): RevisionSnapshot | null {
  if (
    typeof value.document !== "object" ||
    value.document === null ||
    typeof value.entries !== "object" ||
    value.entries === null
  ) {
    return null;
  }

  return value as RevisionSnapshot;
}

export async function generateDocumentRevisionsForWorkspace(input: {
  caseId: string;
  sourceKeys: string[];
  workspace: CaseWorkspaceRecords;
}) {
  const sourceKeys = new Set(input.sourceKeys);
  const sourceDocuments = input.workspace.sourceDocuments.filter((document) => {
    return sourceKeys.has(document.sourceKey) && document.caseDocumentId !== null;
  });

  const claims = [];

  for (const sourceDocument of sourceDocuments) {
    const family = await upsertDocumentFamily({
      caseId: input.caseId,
      familyKey: normalizeFamilyKey(sourceDocument.fileName),
      label: revisionLabel(sourceDocument.fileName),
    });
    const snapshot = buildRevisionSnapshot({
      sourceDocument,
      workspace: input.workspace,
    });
    const serialized = serializeRevisionSnapshot(snapshot);
    const currentVersion = await upsertDocumentVersion({
      caseDocumentId: sourceDocument.caseDocumentId,
      caseId: input.caseId,
      documentFamilyId: family.id,
      label: sourceDocument.fileName,
      snapshotHash: serialized.snapshotHash,
      snapshotJson: serialized.snapshotJson,
      snapshotText: serialized.snapshotText,
      sourceDocumentId: sourceDocument.id,
      uploadedAt: sourceDocument.receivedAt,
    });
    const previousVersion = await getPreviousDocumentVersion({
      documentFamilyId: family.id,
      versionIndex: currentVersion.versionIndex,
    });

    if (!previousVersion || previousVersion.snapshotHash === currentVersion.snapshotHash) {
      continue;
    }

    const beforeSnapshot = snapshotFromStoredJson(previousVersion.snapshotJson);

    if (!beforeSnapshot) {
      continue;
    }

    const diffs = diffRevisionSnapshots({
      afterText: currentVersion.snapshotText,
      beforeText: previousVersion.snapshotText,
    });
    const nextClaims = await upsertDocumentRevisionClaims(
      mapDiffsToRevisionClaims({
        afterSnapshot: snapshot,
        beforeSnapshot,
        caseId: input.caseId,
        diffs,
        documentFamilyId: family.id,
        fromDocumentVersionId: previousVersion.id,
        toDocumentVersionId: currentVersion.id,
      }),
    );

    claims.push(...nextClaims);
  }

  return { claims };
}
