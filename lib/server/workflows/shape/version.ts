import "server-only";

import { HARNESS_VERSION } from "@/lib/contracts/harness";
import { HARNESS_V2_VERSION } from "@/lib/contracts/harness-v2";
import { HARNESS_V3_VERSION } from "@/lib/contracts/harness-v3";

export type HarnessWorkflowVersion = "v1" | "v2" | "v3";

export function selectedHarnessWorkflow(): HarnessWorkflowVersion {
  if (process.env.HARNESS_WORKFLOW_VERSION === "v1") {
    return "v1";
  }

  if (process.env.HARNESS_WORKFLOW_VERSION === "v2") {
    return "v2";
  }

  return "v3";
}

export function selectedHarnessVersion() {
  const workflow = selectedHarnessWorkflow();

  if (workflow === "v1") {
    return HARNESS_VERSION;
  }

  return workflow === "v2" ? HARNESS_V2_VERSION : HARNESS_V3_VERSION;
}
