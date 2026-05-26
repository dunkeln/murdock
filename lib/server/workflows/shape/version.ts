import "server-only";

import { HARNESS_VERSION } from "@/lib/contracts/harness";
import { HARNESS_V2_VERSION } from "@/lib/contracts/harness-v2";

export function selectedHarnessVersion() {
  return process.env.HARNESS_WORKFLOW_VERSION === "v2"
    ? HARNESS_V2_VERSION
    : HARNESS_VERSION;
}

export function selectedHarnessWorkflow() {
  return process.env.HARNESS_WORKFLOW_VERSION === "v2" ? "v2" : "v1";
}
