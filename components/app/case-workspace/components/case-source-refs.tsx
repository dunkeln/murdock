import type { CaseControlItemDto } from "@/lib/case-control";

type CaseSourceRefsProps = {
  item: CaseControlItemDto;
};

function SourceQuote({
  document,
  label,
  page,
  quote,
}: CaseControlItemDto["sourceRefs"][number] & { label: string }) {
  return (
    <blockquote className="text-sm leading-6 text-muted-foreground">
      <p className="mb-1 font-heading text-xs uppercase leading-none text-muted-foreground">
        {label}
      </p>
      <p className="line-clamp-3 text-foreground/85">{quote}</p>
      <footer className="mt-2 truncate font-heading text-xs uppercase leading-none text-muted-foreground">
        {document}
        {page ? ` / ${page}` : ""}
      </footer>
    </blockquote>
  );
}

export function CaseInlineSource({ item }: CaseSourceRefsProps) {
  const source = item.sourceRefs[0];

  if (!source) {
    return (
      <p className="text-sm leading-6 text-muted-foreground">
        Source detail is not attached yet.
      </p>
    );
  }

  return <SourceQuote {...source} label="Source span" />;
}

export function CaseSourceRefs({ item }: CaseSourceRefsProps) {
  const additionalSources = item.sourceRefs.slice(1);

  if (additionalSources.length === 0) {
    return null;
  }

  return (
    <details className="group">
      <summary className="cursor-pointer text-sm text-muted-foreground transition-colors hover:text-foreground">
        More provenance
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        {additionalSources.map((source) => (
          <div className="border-l border-border/70 pl-3" key={source.spanId}>
            <SourceQuote
              {...source}
              label={item.kind === "conflict" ? "Conflicting source" : "Related source"}
            />
          </div>
        ))}
      </div>
    </details>
  );
}
