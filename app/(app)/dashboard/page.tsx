import { CaseTimeline } from "@/components/app/case-timeline";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium text-paper/60">
          Authenticated app route
        </p>
        <h1 className="font-heading text-6xl uppercase leading-none">
          Dashboard
        </h1>
        <p className="max-w-2xl text-paper/70">
          This is the placeholder for the logged-in user experience.
        </p>
      </div>

      <CaseTimeline />
    </div>
  );
}
