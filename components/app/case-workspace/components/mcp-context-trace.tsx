"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type McpContextTraceItem = {
  label: string;
};

type McpContextTraceProps = {
  className?: string;
  items: McpContextTraceItem[];
};

export function McpContextTrace({ className, items }: McpContextTraceProps) {
  const labels = Array.from(new Set(items.map((item) => item.label))).filter(
    Boolean,
  );

  if (labels.length === 0) {
    return null;
  }

  return (
    <div
      aria-label="Consulted case context"
      className={cn("flex min-w-0 flex-wrap items-center gap-1.5", className)}
    >
      {labels.map((label) => (
        <Badge
          className="hover-theme-invert rounded-none border-paper/15 bg-ink px-2 py-0.5 font-sans text-[11px] font-normal leading-4 text-paper"
          key={label}
          variant="outline"
        >
          {label}
        </Badge>
      ))}
    </div>
  );
}
