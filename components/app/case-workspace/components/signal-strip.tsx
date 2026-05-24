import {
  AlertTriangle,
  CalendarClock,
  FileText,
  Fingerprint,
} from "lucide-react";

import { summarizeCaseWorkspace } from "@/lib/case-workspace";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";

type SignalStripProps = {
  workspace: CaseWorkspaceDto;
};

export function SignalStrip({ workspace }: SignalStripProps) {
  const summary = summarizeCaseWorkspace(workspace);
  const signals = [
    {
      label: "Sources",
      value: summary.sourceCount,
      icon: FileText,
    },
    {
      label: "Facts",
      value: summary.factCount,
      icon: Fingerprint,
    },
    {
      label: "Events",
      value: summary.chronologyEventCount,
      icon: CalendarClock,
    },
    {
      label: "Issues",
      value: summary.issueCount,
      icon: AlertTriangle,
    },
  ];

  return (
    <section
      aria-label="Workspace inventory"
      className="flex min-w-0 flex-col gap-3 border-y border-paper/10 py-4"
    >
      <p className="text-xs uppercase text-paper/45">Workspace inventory</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,6.75rem),1fr))] gap-3">
        {signals.map(({ icon: Icon, label, value }) => (
          <div
            className="flex min-h-16 items-center justify-between gap-3 border border-paper/10 px-3 py-2 text-paper/60"
            key={label}
          >
            <span className="flex items-center gap-2 text-xs uppercase">
              <Icon aria-hidden="true" />
              {label}
            </span>
            <span className="font-heading text-2xl leading-none text-paper/80">
              {value}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
