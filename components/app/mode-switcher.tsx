"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import { Toggle } from "@/components/ui/toggle";

function subscribeToMountStore() {
  return () => {};
}

function getMountedSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function ModeSwitcher() {
  const { setTheme, theme } = useTheme();
  const isMounted = React.useSyncExternalStore(
    subscribeToMountStore,
    getMountedSnapshot,
    getServerSnapshot
  );
  const isDark = isMounted && theme !== "light";
  const nextTheme = isDark ? "light" : "dark";

  return (
    <Toggle
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="size-8 min-w-8 rounded-none border-paper/15 bg-ink p-0 text-paper hover:!bg-paper hover:!text-ink data-[state=on]:!bg-ink data-[state=on]:!text-paper data-[state=on]:hover:!bg-paper data-[state=on]:hover:!text-ink"
      onClick={() => setTheme(nextTheme)}
      pressed={isDark}
      size="sm"
      variant="outline"
    >
      {!isMounted ? (
        <span aria-hidden="true" className="size-4" />
      ) : isDark ? (
        <Moon aria-hidden="true" />
      ) : (
        <Sun aria-hidden="true" />
      )}
    </Toggle>
  );
}
