"use client";

import { File, Trash2 } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const fileRowClass =
  "h-8 w-full min-w-0 overflow-hidden border border-paper/15 px-2.5 text-sm leading-none text-paper transition-colors hover:border-paper hover:bg-paper hover:text-ink";
const previewedFileRowClass =
  "border-paper bg-paper text-ink hover:border-paper hover:bg-paper hover:text-ink";
const fileRowTextClass = "block min-w-0 flex-1 truncate leading-none";
const fileRowIconBoxClass =
  "grid size-4 shrink-0 place-items-center overflow-hidden";
const fileRowIconClass = "size-4 shrink-0 text-current";
const transparentCheckboxClass =
  "size-3.5 rounded-none !border-transparent !bg-transparent text-current after:hidden hover:!bg-transparent data-checked:!border-transparent data-checked:!bg-transparent data-checked:!text-current [&_svg]:size-3";
const iconButtonClass =
  "size-3.5 rounded-none border-0 bg-transparent p-0 text-current hover:!bg-transparent hover:!text-current [&_svg]:size-3";

type CaseDocumentSwitcherProps = {
  className?: string;
  items: CaseDocumentSwitcherItem[];
};

export type CaseDocumentSwitcherItem = {
  id: string;
  isIncluded?: boolean;
  isPreviewed: boolean;
  label: string;
  onDelete?: () => void;
  onIncludeChange?: (included: boolean) => void;
  onPreviewChange: (previewed: boolean) => void;
  variant: "persisted" | "transient";
};

function FileRowIcon() {
  return (
    <span className={fileRowIconBoxClass}>
      <File
        aria-hidden="true"
        className={fileRowIconClass}
        strokeWidth={1.9}
      />
    </span>
  );
}

function FileRowText({ children }: { children: ReactNode }) {
  return <span className={fileRowTextClass}>{children}</span>;
}

function CaseDocumentRow({ item }: { item: CaseDocumentSwitcherItem }) {
  if (item.variant === "persisted") {
    return (
      <button
        aria-pressed={item.isPreviewed}
        className={cn(
          fileRowClass,
          "flex w-full items-center gap-2 text-left",
          item.isPreviewed && previewedFileRowClass,
        )}
        onClick={() => item.onPreviewChange(!item.isPreviewed)}
        type="button"
      >
        <FileRowIcon />
        <FileRowText>{item.label}</FileRowText>
      </button>
    );
  }

  return (
    <div
      className={cn(
        fileRowClass,
        "grid grid-cols-[0.875rem_1rem_minmax(0,1fr)_0.875rem] items-center gap-2",
        item.isPreviewed && previewedFileRowClass,
      )}
    >
      <Checkbox
        aria-label={`Include ${item.label} in case context`}
        checked={Boolean(item.isIncluded)}
        className={transparentCheckboxClass}
        onCheckedChange={(checked) => item.onIncludeChange?.(Boolean(checked))}
      />
      <FileRowIcon />
      <Toggle
        aria-label={`Open ${item.label}`}
        className="h-auto max-w-full min-w-0 justify-start overflow-hidden rounded-none border-0 bg-transparent p-0 text-current hover:!bg-transparent hover:!text-current aria-pressed:!bg-transparent has-data-[icon=inline-start]:pl-0"
        onPressedChange={item.onPreviewChange}
        pressed={item.isPreviewed}
      >
        <FileRowText>{item.label}</FileRowText>
      </Toggle>
      <div className="flex size-3.5 items-center justify-end overflow-hidden">
        {item.onDelete ? (
          <Button
            aria-label={`Remove ${item.label}`}
            className={iconButtonClass}
            onClick={item.onDelete}
            size="icon-xs"
            type="button"
            variant="ghost"
          >
            <Trash2 aria-hidden="true" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function CaseDocumentSwitcher({
  className,
  items,
}: CaseDocumentSwitcherProps) {
  const isScrollable = items.length > 3;

  if (items.length === 0) {
    return null;
  }

  const documentItems = (
    <ol className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.id}>
          <CaseDocumentRow item={item} />
        </li>
      ))}
    </ol>
  );

  return (
    <section
      aria-label="Case documents"
      className={cn(
        "w-full min-w-0 text-sm text-paper/70",
        className,
      )}
    >
      {isScrollable ? (
        <ScrollArea className="h-[7.25rem] pr-2">{documentItems}</ScrollArea>
      ) : (
        documentItems
      )}
    </section>
  );
}
