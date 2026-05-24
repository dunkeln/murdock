import { getCaseTypeLabel } from "@/lib/case-type";
import type { CaseWorkspaceDto } from "@/lib/contracts/case-workspace";

import { CaseHeartbeatSection } from "./components/case-heartbeat-section";
import { ChronologySection } from "./components/chronology-section";
import { ContextRegisterSection } from "./components/context-register-section";
import { OperationalIssuesSection } from "./components/operational-issues-section";
import { SignalStrip } from "./components/signal-strip";
import { SourceRegisterSection } from "./components/source-register-section";

type CaseWorkspaceViewProps = {
  workspace: CaseWorkspaceDto;
};

export function CaseWorkspaceView({ workspace }: CaseWorkspaceViewProps) {
  const sourceDocumentsById = new Map(
    workspace.sourceDocuments.map((sourceDocument) => [
      sourceDocument.id,
      sourceDocument,
    ])
  );
  const sourceSpansById = new Map(
    workspace.sourceSpans.map((sourceSpan) => [sourceSpan.id, sourceSpan])
  );

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-7 overflow-y-auto overflow-x-hidden pr-1 text-paper [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium text-paper/60">
          {getCaseTypeLabel(workspace.case.type)} · {workspace.case.status}
        </p>
        <h1 className="font-heading text-5xl uppercase leading-none sm:text-6xl">
          {workspace.case.title}
        </h1>
      </header>

      <CaseHeartbeatSection
        sourceDocumentsById={sourceDocumentsById}
        sourceSpansById={sourceSpansById}
        workspace={workspace}
      />

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <ChronologySection
          events={workspace.chronologyEvents}
          sourceDocumentsById={sourceDocumentsById}
          sourceSpansById={sourceSpansById}
        />
        <OperationalIssuesSection
          issues={workspace.issues}
          sourceDocumentsById={sourceDocumentsById}
          sourceSpansById={sourceSpansById}
        />
      </div>

      <ContextRegisterSection
        facts={workspace.facts}
        sourceDocumentsById={sourceDocumentsById}
        sourceSpansById={sourceSpansById}
      />

      <SignalStrip workspace={workspace} />

      <SourceRegisterSection sourceDocuments={workspace.sourceDocuments} />
    </div>
  );
}
