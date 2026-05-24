import "server-only";

import type {
  CaseWorkspaceAnalysisRequest,
  CaseWorkspaceAnalysisResult,
  CaseWorkspaceServiceError,
} from "@/lib/contracts/case-workspace";

export type CaseWorkspaceAnalysisAdapterResult =
  | {
      data: CaseWorkspaceAnalysisResult;
      isError: false;
    }
  | CaseWorkspaceServiceError;

export type CaseWorkspaceAnalysisAdapter = {
  analyzeCaseWorkspaceSources: (
    request: CaseWorkspaceAnalysisRequest
  ) => Promise<CaseWorkspaceAnalysisAdapterResult>;
};
