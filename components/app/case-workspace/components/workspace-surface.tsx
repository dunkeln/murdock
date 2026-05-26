"use client";

import type { ComponentPropsWithoutRef } from "react";

import { cn } from "@/lib/utils";

type WorkspaceSurfaceProps = ComponentPropsWithoutRef<"section"> & {
  mode?: WorkspaceSurfaceMode;
};

export type WorkspaceSurfaceMode = "contained" | "content";

export const sharedWorkspaceSurfaceWidthClass =
  "w-full xl:w-[90%] xl:max-w-[84rem]";

export function WorkspaceSurface({
  children,
  className,
  mode = "contained",
  ...props
}: WorkspaceSurfaceProps) {
  return (
    <section
      {...props}
      className={cn(
        "flex min-w-0 max-w-full flex-col",
        mode === "contained"
          ? "min-h-[34rem] overflow-hidden xl:min-h-0"
          : "h-auto items-start overflow-visible",
        className,
      )}
      data-case-workspace-surface
    >
      {children}
    </section>
  );
}
