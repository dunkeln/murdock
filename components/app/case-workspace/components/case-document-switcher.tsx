"use client";

import * as React from "react";
import { File, Files, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const fileRowClass =
  "h-8 w-full min-w-0 overflow-hidden border border-paper/15 px-2.5 text-sm leading-none text-paper transition-colors hover:border-paper/45 hover:bg-paper/5 hover:text-paper";
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
const drawerTriggerClass =
  "hover-theme-invert h-9 w-fit justify-center rounded-none border-paper/15 bg-ink px-2.5 font-heading text-sm uppercase text-paper";

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

function CaseDocumentRow({
  item,
}: {
  item: CaseDocumentSwitcherItem;
}) {
  if (item.variant === "persisted") {
    return (
      <button
        aria-pressed={item.isPreviewed}
        className={cn(
          fileRowClass,
          "flex w-full items-center gap-2 text-left",
          item.isPreviewed && previewedFileRowClass,
        )}
        onClick={() => {
          item.onPreviewChange(!item.isPreviewed);
        }}
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
        onPressedChange={(previewed) => {
          item.onPreviewChange(previewed);
        }}
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
  const [isOpen, setIsOpen] = React.useState(false);

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
    <Sheet onOpenChange={setIsOpen} open={isOpen}>
      <section
        aria-label="Case documents"
        className={cn(
          "w-fit min-w-0 text-sm text-paper/70",
          className,
        )}
        data-case-document-switcher
      >
        <SheetTrigger asChild>
          <Button
            aria-label="Open case files"
            className={cn(drawerTriggerClass, isOpen && "active-theme-invert")}
            type="button"
            variant="outline"
          >
            <span className="flex min-w-0 items-center gap-2">
              <Files aria-hidden="true" data-icon="inline-start" />
              <span>Files</span>
            </span>
          </Button>
        </SheetTrigger>
      </section>
      <SheetContent
        className="w-[min(25rem,calc(100vw-1.5rem))] border-t border-l border-paper/15 bg-ink text-paper shadow-none"
        data-case-document-switcher
        overlayClassName="top-14 bg-transparent supports-backdrop-filter:backdrop-blur-none"
        showCloseButton={false}
        side="right"
        style={{
          height: "calc(100vh - 3.5rem)",
          left: "auto",
          right: 0,
          top: "3.5rem",
        }}
      >
        <SheetHeader className="border-b border-paper/15 px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <SheetTitle className="font-heading text-lg uppercase leading-none text-paper">
                Files
              </SheetTitle>
            </div>
            <SheetClose asChild>
              <Button
                aria-label="Close files drawer"
                className="size-6 rounded-none border border-paper/15 bg-transparent p-0 text-paper/70 hover:bg-paper hover:text-ink"
                size="icon-xs"
                type="button"
                variant="ghost"
              >
                <X aria-hidden="true" />
              </Button>
            </SheetClose>
          </div>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-4 py-3">
          {documentItems}
        </ScrollArea>
        <Separator className="bg-paper/15" />
      </SheetContent>
    </Sheet>
  );
}
