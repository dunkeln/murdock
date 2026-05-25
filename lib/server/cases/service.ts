import "server-only";

import type { CaseSummaryDto, CreateCaseInput } from "@/lib/contracts/cases";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import {
  createCaseByUser,
  deleteCaseByUser,
  listCaseSummariesByUser,
  updateCaseTitleByUser,
} from "@/lib/server/cases/repository";

export async function listCurrentUserCaseSummaries(): Promise<CaseSummaryDto[]> {
  const user = await getCurrentUser();

  return listCaseSummariesByUser({
    userId: user.id,
    limit: 25,
  });
}

export async function createCurrentUserCase(
  data: CreateCaseInput
): Promise<CaseSummaryDto> {
  const user = await getCurrentUser();

  return createCaseByUser({
    userId: user.id,
    data,
  });
}

export async function deleteCurrentUserCase(
  caseId: string
): Promise<CaseSummaryDto | null> {
  const user = await getCurrentUser();

  return deleteCaseByUser({
    caseId,
    userId: user.id,
  });
}

export async function updateCurrentUserCaseTitle(input: {
  caseId: string;
  title: string;
}): Promise<CaseSummaryDto | null> {
  const user = await getCurrentUser();

  return updateCaseTitleByUser({
    userId: user.id,
    caseId: input.caseId,
    title: input.title,
  });
}
