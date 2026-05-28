import { createHash } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import type {
  CaseActionTaskActor,
  CaseActionTaskKind,
  CaseActionTaskSource,
} from "@/lib/contracts/case-action-tasks";
import {
  getCaseActionQueueOutputSchema,
  getRoiReviewPlanOutputSchema,
  upsertCaseActionTaskOutputSchema,
} from "@/lib/contracts/mcp";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import type { ReviewWorkItemPriority } from "@/lib/contracts/review-work-item";
import { updateCaseActionTaskStatus } from "@/lib/server/case-action-tasks/service";
import { getCurrentUserCaseWorkspaceById } from "@/lib/server/case-workspace/service";
import { executeMurdockMcpV1Tool } from "@/lib/server/mcp/v1";
import { mapCaseActionTask } from "@/lib/server/mcp/v1/projections";
import { sourceSpanRef } from "@/lib/server/mcp/v1/refs";
import {
  reviewWorkItemRef,
  synthesizeCaseActionTaskFromChoice,
} from "@/lib/server/subagents/actionables/service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    caseId: string;
  }>;
};

const queueReviewerChoiceRequestSchema = z.object({
  itemId: z.string().min(1),
  mode: z.literal("choice"),
  choiceRef: z.string().min(1),
});

const queueCustomStepRequestSchema = z.object({
  itemId: z.string().min(1),
  mode: z.literal("custom"),
  customStep: z.string().trim().min(1).max(1000),
});

const queueDismissalRequestSchema = z.object({
  itemId: z.string().min(1),
  mode: z.literal("ignore"),
});

const updateTaskStatusRequestSchema = z.object({
  mode: z.literal("status"),
  status: z.enum(["queued", "done", "dismissed"]),
  taskKey: z.string().min(1),
});

const queueActionRequestSchema = z.discriminatedUnion("mode", [
  queueReviewerChoiceRequestSchema,
  queueCustomStepRequestSchema,
  queueDismissalRequestSchema,
  updateTaskStatusRequestSchema,
]);

function noStoreResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "no-store",
    },
    status,
  });
}

function refsForWorkspace(workspace: CaseWorkspaceDto) {
  return {
    itemById: new Map(workspace.reviewWorkItems.map((item) => [item.id, item])),
    itemByReviewRef: new Map(
      workspace.reviewWorkItems.map((item) => [
        reviewWorkItemRef(item),
        item,
      ] as const),
    ),
    itemIdByReviewRef: new Map(
      workspace.reviewWorkItems.map((item) => [
        reviewWorkItemRef(item),
        item.id,
      ] as const),
    ),
    reviewRefByItemId: new Map(
      workspace.reviewWorkItems.map((item) => [
        item.id,
        reviewWorkItemRef(item),
      ] as const),
    ),
  };
}

async function loadWorkspaceOrResponse(caseId: string) {
  const workspaceResult = await getCurrentUserCaseWorkspaceById(caseId);

  if (!workspaceResult.ok) {
    return {
      response: noStoreResponse(
        {
          message: workspaceResult.error.message,
        },
        workspaceResult.error.errorCategory === "not_found" ? 404 : 500,
      ),
    };
  }

  return { workspace: workspaceResult.workspace };
}

async function queueSnapshot(caseId: string) {
  const queueResult = await executeMurdockMcpV1Tool("get_case_action_queue", {
    caseId,
    includeDone: false,
    limit: 25,
  });

  if (!queueResult.ok) {
    throw new Error(queueResult.message);
  }

  return getCaseActionQueueOutputSchema.parse(queueResult.data);
}

function hashKey(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function highestPriority(
  priorities: ReviewWorkItemPriority[],
): ReviewWorkItemPriority {
  const rank = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  } satisfies Record<ReviewWorkItemPriority, number>;

  return priorities.sort((left, right) => rank[left] - rank[right])[0] ?? "medium";
}

function compactTaskText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export async function GET(_request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const workspaceLoad = await loadWorkspaceOrResponse(caseId);

  if ("response" in workspaceLoad) {
    return workspaceLoad.response;
  }

  try {
    return noStoreResponse(await queueSnapshot(workspaceLoad.workspace.case.id));
  } catch (error) {
    return noStoreResponse(
      {
        message:
          error instanceof Error ? error.message : "Action queue snapshot failed.",
      },
      500,
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const { caseId } = await context.params;
  const parsedBody = queueActionRequestSchema.safeParse(
    await request.json().catch(() => ({})),
  );

  if (!parsedBody.success) {
    return noStoreResponse(
      {
        message:
          parsedBody.error.issues[0]?.message ??
          "Invalid reviewer action request.",
      },
      400,
    );
  }

  const workspaceLoad = await loadWorkspaceOrResponse(caseId);

  if ("response" in workspaceLoad) {
    return workspaceLoad.response;
  }

  const { workspace } = workspaceLoad;
  const refs = refsForWorkspace(workspace);

  if (parsedBody.data.mode === "status") {
    const task = await updateCaseActionTaskStatus({
      caseId: workspace.case.id,
      status: parsedBody.data.status,
      taskKey: parsedBody.data.taskKey,
    });

    if (!task) {
      return noStoreResponse({ message: "Action task not found." }, 404);
    }

    try {
      return noStoreResponse({
        queue: await queueSnapshot(workspace.case.id),
        task: mapCaseActionTask(task),
      });
    } catch (error) {
      return noStoreResponse(
        {
          message:
            error instanceof Error ? error.message : "Action queue snapshot failed.",
        },
        500,
      );
    }
  }

  const item = refs.itemById.get(parsedBody.data.itemId);

  if (!item) {
    return noStoreResponse({ message: "Review item not found." }, 404);
  }

  let taskInput:
    | {
        actor: CaseActionTaskActor;
        connectorHint: string | null;
        description: string;
        kind: CaseActionTaskKind;
        priority: ReviewWorkItemPriority;
        provenanceRefs: unknown[];
        sourceReviewRefs: string[];
        sourceSpanRefs: string[];
        sourceType: CaseActionTaskSource;
        taskKey: string;
        title: string;
      }
    | null = null;

  if (parsedBody.data.mode === "choice") {
    const choiceRef = parsedBody.data.choiceRef;
    const activeReviewRef = refs.reviewRefByItemId.get(item.id);
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
    const selectedChoice = plan.choices.find(
      (choice) => choice.choiceRef === choiceRef,
    );

    if (!selectedChoice) {
      return noStoreResponse(
        {
          message: "Reviewer action choice is no longer available.",
        },
        409,
      );
    }

    const affectedItems = selectedChoice.affectedReviewRefs.flatMap((ref) => {
      const affectedItem = refs.itemByReviewRef.get(ref);

      return affectedItem ? [affectedItem] : [];
    });
    const taskSynthesis = synthesizeCaseActionTaskFromChoice({
      choice: selectedChoice,
      items: affectedItems,
    });

    taskInput = {
      actor: selectedChoice.actor,
      connectorHint: selectedChoice.id,
      description: taskSynthesis.description,
      kind: selectedChoice.taskKind,
      priority: highestPriority(affectedItems.map((affectedItem) => affectedItem.priority)),
      provenanceRefs: taskSynthesis.provenanceRefs,
      sourceReviewRefs: selectedChoice.affectedReviewRefs,
      sourceSpanRefs: Array.from(
        new Set(
          affectedItems.flatMap((affectedItem) =>
            affectedItem.sourceSpanIds.map(sourceSpanRef),
          ),
        ),
      ),
      sourceType: "reviewer_choice",
      taskKey: `reviewer_choice:${selectedChoice.choiceRef}`,
      title: taskSynthesis.title,
    };
  } else if (parsedBody.data.mode === "custom") {
    const reviewRef = refs.reviewRefByItemId.get(item.id) ?? reviewWorkItemRef(item);

    taskInput = {
      actor: "case_team",
      connectorHint: null,
      description: parsedBody.data.customStep,
      kind: "mark_for_case_team_review",
      priority: item.priority,
      provenanceRefs: [
        {
          kind: "custom_user_step",
          label: parsedBody.data.customStep,
          ref: reviewRef,
        },
        ...item.provenanceRefs,
      ],
      sourceReviewRefs: [reviewRef],
      sourceSpanRefs: item.sourceSpanIds.map(sourceSpanRef),
      sourceType: "custom_user_step",
      taskKey: `custom_user_step:${item.id}:${hashKey(parsedBody.data.customStep)}`,
      title: `${parsedBody.data.customStep}: ${item.title}`,
    };
  } else {
    const reviewRef = refs.reviewRefByItemId.get(item.id) ?? reviewWorkItemRef(item);

    taskInput = {
      actor: "case_team",
      connectorHint: "dismissed",
      description: `Review whether this item should be ignored or dismissed later: ${item.summary}`,
      kind: "dismiss_review_item",
      priority: item.priority,
      provenanceRefs: [
        {
          kind: "dismissal_request",
          label: item.title,
          ref: reviewRef,
        },
        ...item.provenanceRefs,
      ],
      sourceReviewRefs: [reviewRef],
      sourceSpanRefs: item.sourceSpanIds.map(sourceSpanRef),
      sourceType: "dismissal_request",
      taskKey: `dismissal_request:${reviewRef}`,
      title: `Ignore ${item.title}`,
    };
  }

  const taskResult = await executeMurdockMcpV1Tool("upsert_case_action_task", {
    caseId: workspace.case.id,
    ...taskInput,
    description: compactTaskText(taskInput.description, 1000),
    status: "queued",
    title: compactTaskText(taskInput.title, 160),
  });

  if (!taskResult.ok) {
    return noStoreResponse(
      {
        message: taskResult.message,
      },
      taskResult.errorCategory === "not_found" ? 404 : 500,
    );
  }

  try {
    return noStoreResponse({
      queue: await queueSnapshot(workspace.case.id),
      task: upsertCaseActionTaskOutputSchema.parse(taskResult.data).task,
    });
  } catch (error) {
    return noStoreResponse(
      {
        message:
          error instanceof Error ? error.message : "Action queue snapshot failed.",
      },
      500,
    );
  }
}
