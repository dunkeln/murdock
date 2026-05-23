import "server-only";

import type { CaseSummaryDto } from "@/lib/contracts/cases";
import { getCurrentUser } from "@/lib/server/auth/current-user";
import {
  getCaseSummaryByUserAndSlug,
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

export async function getCurrentUserCaseSummaryBySlug(
  slug: string
): Promise<CaseSummaryDto | null> {
  const user = await getCurrentUser();

  return getCaseSummaryByUserAndSlug({
    userId: user.id,
    slug,
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
