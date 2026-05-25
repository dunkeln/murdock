import { redirect } from "next/navigation";

import { listCurrentUserCaseSummaries } from "@/lib/server/cases/service";

export default async function DashboardPage() {
  const [firstCase] = await listCurrentUserCaseSummaries();

  if (firstCase) {
    redirect(`/case/${firstCase.slug}`);
  }

  return null;
}
