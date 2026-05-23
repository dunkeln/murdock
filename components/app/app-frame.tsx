"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const matters = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/case", label: "Case" },
  { href: "/case/client-intake", label: "Client intake" },
  { href: "/case/draft-review", label: "Draft review" },
  { href: "/case/filing-prep", label: "Filing prep" },
];
const notes = [
  "Matter context placeholder",
  "Deadline queue placeholder",
  "Document review placeholder",
];

type AppFrameProps = {
  children: React.ReactNode;
};

export function AppFrame({ children }: AppFrameProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  return (
    <div
      className={cn(
        "grid w-full gap-8 px-6 transition-[grid-template-columns] lg:px-8",
        isCollapsed ? "md:grid-cols-[4.5rem_1fr]" : "md:grid-cols-[18rem_1fr]"
      )}
    >
      <aside className="flex max-w-72 flex-col gap-8 border-paper/15 py-8 text-sm text-paper/70 md:min-h-[calc(100vh-3.5rem)] md:border-r md:pr-8">
        <div className="flex items-start justify-between gap-3">
          <div className={cn("flex flex-col gap-3", isCollapsed && "md:hidden")}>
            <p className="font-heading text-3xl uppercase leading-none text-paper">
              Workspace
            </p>
            <p>
              Placeholder side panel for matter context, navigation, and
              operator notes.
            </p>
          </div>
          <Button
            aria-label={isCollapsed ? "Expand side panel" : "Collapse side panel"}
            className="rounded-none border border-paper/15 bg-ink text-paper hover:bg-paper hover:text-ink"
            onClick={() => setIsCollapsed((current) => !current)}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            {isCollapsed ? (
              <PanelLeftOpen data-icon="inline-start" />
            ) : (
              <PanelLeftClose data-icon="inline-start" />
            )}
          </Button>
        </div>

        <section className={cn("flex flex-col gap-3", isCollapsed && "md:hidden")}>
          <p className="text-xs font-medium uppercase tracking-wide text-paper/45">
            Active queues
          </p>
          <nav className="flex flex-col gap-2">
            {matters.map((matter) => (
              <Link
                className="border border-paper/15 px-3 py-2 text-paper transition-colors hover:bg-paper hover:text-ink"
                href={matter.href}
                key={matter.label}
              >
                {matter.label}
              </Link>
            ))}
          </nav>
        </section>

        <section className={cn("flex flex-col gap-3", isCollapsed && "md:hidden")}>
          <p className="text-xs font-medium uppercase tracking-wide text-paper/45">
            Notes
          </p>
          <div className="flex flex-col gap-2">
            {notes.map((note) => (
              <p className="border-l border-paper/20 pl-3" key={note}>
                {note}
              </p>
            ))}
          </div>
        </section>
      </aside>

      <div className="py-8">{children}</div>
    </div>
  );
}
