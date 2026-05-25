import "server-only";

import { createHash } from "node:crypto";

export function id(parts: Array<string | number | null | undefined>) {
  return createHash("sha256")
    .update(
      parts
        .map((part) => (part === null || part === undefined ? "" : String(part)))
        .join(":"),
    )
    .digest("hex")
    .slice(0, 24);
}

export function key(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 96);
}
