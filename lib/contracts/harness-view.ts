import { z } from "zod";

import { caseSummaryDtoSchema } from "@/lib/contracts/cases";
import {
  caseWorkspaceChronologyEventDtoSchema,
  caseWorkspaceFactDtoSchema,
  caseWorkspaceIssueDtoSchema,
  caseWorkspaceSourceDocumentDtoSchema,
  caseWorkspaceSourceSpanDtoSchema,
} from "@/lib/contracts/case-workspace";
import { documentRevisionSummaryDtoSchema } from "@/lib/contracts/document-revisions";
import {
  matterOperationDtoSchema,
  matterOperationEventDtoSchema,
  matterOperationalSnapshotDtoSchema,
} from "@/lib/contracts/matter-operations";
import { reviewWorkItemSchema } from "@/lib/contracts/review-work-item";

export const canonicalHarnessViewSchema = z.object({
  case: caseSummaryDtoSchema,
  chronologyEvents: z.array(caseWorkspaceChronologyEventDtoSchema),
  diffs: z.array(documentRevisionSummaryDtoSchema),
  facts: z.array(caseWorkspaceFactDtoSchema),
  finalMatter: matterOperationalSnapshotDtoSchema,
  issues: z.array(caseWorkspaceIssueDtoSchema),
  reviewWorkItems: z.array(reviewWorkItemSchema),
  sourceDocuments: z.array(caseWorkspaceSourceDocumentDtoSchema),
  sourceSpans: z.array(caseWorkspaceSourceSpanDtoSchema),
  temporalEvents: z.array(matterOperationEventDtoSchema),
  temporalOperations: z.array(matterOperationDtoSchema),
});

export type CanonicalHarnessView = z.infer<
  typeof canonicalHarnessViewSchema
>;
