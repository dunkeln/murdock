"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

function connectorUrl() {
  return `${window.location.origin}/api/mcp/v1`;
}

async function writeClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");

  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.left = "-9999px";
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ClaudeConnectorCopy() {
  const [copied, setCopied] = useState(false);

  async function copyConfig() {
    await writeClipboard(connectorUrl());
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <Button
      className="hover-theme-invert h-9 w-fit rounded-none border-paper/25 bg-ink px-3 text-paper"
      onClick={copyConfig}
      type="button"
      variant="outline"
    >
      {copied ? (
        <Check aria-hidden className="size-4" strokeWidth={1.6} />
      ) : (
        <Copy aria-hidden className="size-4" strokeWidth={1.6} />
      )}
      {copied ? "Copied" : "Copy Claude URL"}
    </Button>
  );
}
