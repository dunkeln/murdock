import "server-only";

import type { AGUIEvent } from "@ag-ui/core";

import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";
import { buildWorkspaceState } from "@/lib/workspace-controls";
import {
  controlRevealEvents,
  runFinished,
  runStarted,
  stateSnapshot,
  stepFinished,
  stepStarted,
} from "@/lib/server/agui/events";

export function workspaceReadyEvents(input: {
  runId: string;
  threadId: string;
  workspace: CaseWorkspaceDto;
}): AGUIEvent[] {
  const state = buildWorkspaceState({
    status: input.workspace.issues.some((issue) => issue.status === "open")
      ? "needs_review"
      : "ready",
    workspace: input.workspace,
  });

  return [
    runStarted({
      caseId: input.workspace.case.id,
      runId: input.runId,
      threadId: input.threadId,
    }),
    stepStarted("ocr-ready"),
    stepFinished("ocr-ready"),
    stepStarted("harness-v1"),
    stepFinished("harness-v1"),
    stateSnapshot(state),
    ...controlRevealEvents({
      actions: state.actions,
      caseId: input.workspace.case.id,
      runId: input.runId,
    }),
    runFinished({
      runId: input.runId,
      threadId: input.threadId,
      status: state.status,
    }),
  ];
}
