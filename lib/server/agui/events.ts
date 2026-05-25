import "server-only";

import type {
  ActivitySnapshotEvent,
  AGUIEvent,
  CustomEvent,
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StateSnapshotEvent,
  StepFinishedEvent,
  StepStartedEvent,
} from "@ag-ui/core";
import { EventType } from "@ag-ui/core";

import {
  type ControlAction,
  type ControlCustomEventName,
  type WorkspaceControlState,
  parseAguiEvent,
} from "@/lib/agui";

function timestamp() {
  return Date.now();
}

export function runStarted(input: {
  caseId: string;
  runId: string;
  threadId: string;
}): RunStartedEvent {
  return parseAguiEvent({
    type: EventType.RUN_STARTED,
    timestamp: timestamp(),
    threadId: input.threadId,
    runId: input.runId,
    input: {
      threadId: input.threadId,
      runId: input.runId,
      state: {
        caseId: input.caseId,
      },
      messages: [],
      tools: [],
      context: [],
    },
  }) as RunStartedEvent;
}

export function runFinished(input: {
  runId: string;
  threadId: string;
  status: string;
}): RunFinishedEvent {
  return parseAguiEvent({
    type: EventType.RUN_FINISHED,
    timestamp: timestamp(),
    threadId: input.threadId,
    runId: input.runId,
    result: {
      status: input.status,
    },
  }) as RunFinishedEvent;
}

export function runError(input: {
  code: string;
  message: string;
}): RunErrorEvent {
  return parseAguiEvent({
    type: EventType.RUN_ERROR,
    timestamp: timestamp(),
    code: input.code,
    message: input.message,
  }) as RunErrorEvent;
}

export function stepStarted(stepName: string): StepStartedEvent {
  return parseAguiEvent({
    type: EventType.STEP_STARTED,
    timestamp: timestamp(),
    stepName,
  }) as StepStartedEvent;
}

export function stepFinished(stepName: string): StepFinishedEvent {
  return parseAguiEvent({
    type: EventType.STEP_FINISHED,
    timestamp: timestamp(),
    stepName,
  }) as StepFinishedEvent;
}

export function stateSnapshot(
  state: WorkspaceControlState,
): StateSnapshotEvent {
  return parseAguiEvent({
    type: EventType.STATE_SNAPSHOT,
    timestamp: timestamp(),
    snapshot: state,
  }) as StateSnapshotEvent;
}

function activitySnapshot(input: {
  action: ControlAction;
  messageId: string;
}): ActivitySnapshotEvent {
  return parseAguiEvent({
    type: EventType.ACTIVITY_SNAPSHOT,
    timestamp: timestamp(),
    activityType: "murdock.control.action",
    messageId: input.messageId,
    replace: true,
    content: input.action,
  }) as ActivitySnapshotEvent;
}

function customEvent(input: {
  name: ControlCustomEventName;
  value: unknown;
}): CustomEvent {
  return parseAguiEvent({
    type: EventType.CUSTOM,
    timestamp: timestamp(),
    name: input.name,
    value: input.value,
  }) as CustomEvent;
}

export function controlRevealEvents(input: {
  actions: ControlAction[];
  caseId: string;
  runId: string;
}): AGUIEvent[] {
  return input.actions.flatMap((action) => [
    activitySnapshot({
      action,
      messageId: `${input.runId}:${action.id}`,
    }),
    customEvent({
      name: "murdock.control.reveal",
      value: {
        actionId: action.id,
        caseId: input.caseId,
        kind: action.kind,
      },
    }),
  ]);
}
