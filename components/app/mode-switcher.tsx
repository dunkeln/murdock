"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

import { Toggle } from "@/components/ui/toggle";

export function ModeSwitcher() {
  const { setTheme, theme } = useTheme();
  const isDark = theme !== "light";

  return (
    <Toggle
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-8 min-w-8 rounded-none border-paper/15 bg-ink p-0 text-paper hover:!bg-paper hover:!text-ink data-[state=on]:!bg-ink data-[state=on]:!text-paper data-[state=on]:hover:!bg-paper data-[state=on]:hover:!text-ink"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      pressed={isDark}
      size="sm"
      variant="outline"
    >
      {isDark ? (
        <Moon aria-hidden="true" />
      ) : (
        <Sun aria-hidden="true" />
      )}
    </Toggle>
  );
}
