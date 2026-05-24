type EmptySectionProps = {
  label: string;
};

export function EmptySection({ label }: EmptySectionProps) {
  return (
    <div className="border border-paper/15 px-4 py-5 text-sm text-paper/55">
      {label}
    </div>
  );
}
