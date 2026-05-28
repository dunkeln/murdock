import { NextResponse } from "next/server";
import { z } from "zod";

import { getRoiReviewPlanOutputSchema } from "@/lib/contracts/mcp";
import { getCurrentUserCaseWorkspaceById } from "@/lib/server/case-workspace/service";
import { executeMurdockMcpV1Tool } from "@/lib/server/mcp/v1";
import { reviewWorkItemRef } from "@/lib/server/subagents/actionables/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

const reviewerPlanRequestSchema = z.object({
  activeItemId: z.string().min(1).nullable().optional(),
});

function noStoreResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const parsedBody = reviewerPlanRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsedBody.success) {
    return noStoreResponse(
      {
        message:
          parsedBody.error.issues[0]?.message ?? "Invalid reviewer plan request.",
      },
      400,
    );
  }

  const workspaceResult = await getCurrentUserCaseWorkspaceById(caseId);

  if (!workspaceResult.ok) {
    return noStoreResponse(
      {
        message: workspaceResult.error.message,
      },
      workspaceResult.error.errorCategory === "not_found" ? 404 : 500,
    );
  }

  const workspace = workspaceResult.workspace;
  const reviewRefByItemId = new Map(
    workspace.reviewWorkItems.map((item) => [
      item.id,
      reviewWorkItemRef(item),
    ] as const),
  );
  const itemIdByReviewRef = new Map(
    workspace.reviewWorkItems.map((item) => [
      reviewWorkItemRef(item),
      item.id,
    ] as const),
  );
  const activeItemId = parsedBody.data.activeItemId ?? null;
  const activeReviewRef =
    activeItemId && reviewRefByItemId.has(activeItemId)
      ? reviewRefByItemId.get(activeItemId)
      : undefined;
  const planResult = await executeMurdockMcpV1Tool("get_actionable_choices", {
    activeReviewRef,
    caseId: workspace.case.id,
    maxChoices: 3,
  });

  if (!planResult.ok) {
    return noStoreResponse(
      {
        message: planResult.message,
      },
      planResult.errorCategory === "not_found" ? 404 : 500,
    );
  }

  const plan = getRoiReviewPlanOutputSchema.parse(planResult.data);

  return noStoreResponse({
    ...plan,
    itemIdsByReviewRef: Object.fromEntries(itemIdByReviewRef),
  });
}
