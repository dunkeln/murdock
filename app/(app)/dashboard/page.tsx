export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-muted-foreground">
        Authenticated app route
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="max-w-2xl text-muted-foreground">
        This is the placeholder for the logged-in user experience.
      </p>
    </div>
  );
}
