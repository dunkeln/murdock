import {
  type CreateLegalWorkflowRunInput,
  type LegalWorkflowRunDto,
  createLegalWorkflowRunInputSchema,
  legalWorkflowRunDtoSchema,
} from "@/lib/contracts/legal-workflows";

export type LegalWorkflowHealthSummary = {
  documentCount: number;
  readyDocumentCount: number;
  missingFactCount: number;
  blockedTaskCount: number;
  pendingReviewCount: number;
};

export type LegalWorkflowRunDraft = Omit<
  LegalWorkflowRunDto,
  "id" | "caseId" | "createdAt" | "updatedAt"
> & {
  caseId: string;
  createdAt: null;
  updatedAt: null;
};

export function parseLegalWorkflowRun(value: unknown): LegalWorkflowRunDto {
  return legalWorkflowRunDtoSchema.parse(value);
}

export function createLegalWorkflowRunDraft(
  input: CreateLegalWorkflowRunInput,
): LegalWorkflowRunDraft {
  const parsed = createLegalWorkflowRunInputSchema.parse(input);
  const orderedStages = [...parsed.definition.stages].sort((left, right) => {
    return left.order - right.order;
  });

  return {
    caseId: parsed.caseId,
    workflowKey: parsed.definition.key,
    workflowVersion: parsed.definition.version,
    title: parsed.definition.title,
    status: "not_started",
    currentStageKey: orderedStages[0]?.key ?? null,
    stages: orderedStages.map((stage) => ({
      key: stage.key,
      title: stage.title,
      status: "not_started",
      startedAt: null,
      completedAt: null,
    })),
    documents: [],
    facts: [],
    tasks: [],
    reviewDecisions: [],
    metadata: parsed.metadata,
    createdAt: null,
    updatedAt: null,
  };
}

export function summarizeLegalWorkflowHealth(
  run: LegalWorkflowRunDto,
): LegalWorkflowHealthSummary {
  return {
    documentCount: run.documents.length,
    readyDocumentCount: run.documents.filter((document) => {
      return document.status === "ready" && document.ocrStatus === "ready";
    }).length,
    missingFactCount: run.facts.filter((fact) => fact.isMissing).length,
    blockedTaskCount: run.tasks.filter((task) => task.status === "blocked")
      .length,
    pendingReviewCount: run.reviewDecisions.filter((decision) => {
      return (
        decision.outcome === "needs_review" || decision.outcome === "blocked"
      );
    }).length,
  };
}
