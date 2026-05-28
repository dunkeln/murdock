import "server-only";

import type { DocumentRevisionSummaryDto } from "@/lib/contracts/document-revisions";
import type { CaseWorkspaceRecords } from "@/lib/server/case-workspace/repository";
import {
  reduceHarnessV2ReviewActions,
  type ReviewReducerWorkflowResult,
} from "@/lib/server/harness/workflows/v2/reducer/workflow";
import type { HarnessBundleResult } from "@/lib/server/workflows/shape/project";

export async function runReducerSubagent(input: {
  bundles: HarnessBundleResult[];
  caseId: string;
  harnessRunId: string;
  records: CaseWorkspaceRecords;
  revisionSummaries: DocumentRevisionSummaryDto[];
}): Promise<ReviewReducerWorkflowResult> {
  return reduceHarnessV2ReviewActions(input);
}
