import "server-only";

import { createHash } from "node:crypto";

export async function toUint8Array(
  content: Uint8Array | ArrayBuffer | Blob
): Promise<Uint8Array<ArrayBuffer>> {
  if (content instanceof Uint8Array) {
    const copy = new Uint8Array(content.byteLength);
    copy.set(content);
    return copy;
  }

  if (content instanceof ArrayBuffer) {
    return new Uint8Array(content);
  }

  return new Uint8Array(await content.arrayBuffer());
}

export function sha256Hex(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}
