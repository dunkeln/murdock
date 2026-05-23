import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CaseTimelineStep = {
  id: string;
  label: string;
  status: "idle" | "active" | "done";
};

const timelineSteps: CaseTimelineStep[] = [
  { id: "intake", label: "Intake", status: "done" },
  { id: "review", label: "Review", status: "active" },
  { id: "draft", label: "Draft", status: "idle" },
  { id: "file", label: "File", status: "idle" },
];

const stepClasses: Record<CaseTimelineStep["status"], string> = {
  active: "bg-paper text-ink hover:bg-paper/90",
  done: "border-done bg-done text-done-foreground hover:bg-done/90 hover:text-done-foreground",
  idle: "bg-ink text-paper hover:bg-paper hover:text-ink",
};

const stepVariants: Record<CaseTimelineStep["status"], "default" | "outline"> = {
  active: "default",
  done: "default",
  idle: "outline",
};

export function CaseTimeline() {
  return (
    <ol className="flex w-full flex-wrap items-center gap-3">
      {timelineSteps.map((step, index) => (
        <li className="flex items-center gap-3" key={step.id}>
          <Button
            className={cn(
              "rounded-none border-paper/15 px-5 uppercase tracking-normal",
              stepClasses[step.status]
            )}
            type="button"
            variant={stepVariants[step.status]}
          >
            {step.label}
          </Button>

          {index < timelineSteps.length - 1 ? (
            <ArrowRight
              aria-hidden="true"
              className="text-paper/70"
              data-icon="inline-end"
              strokeWidth={2.5}
            />
          ) : null}
        </li>
      ))}
    </ol>
  );
}
