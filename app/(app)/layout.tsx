import { connection } from "next/server";
import Link from "next/link";

import { AppFrame } from "@/components/app/app-frame";
import { ModeSwitcher } from "@/components/app/mode-switcher";
import { Toaster } from "@/components/ui/sonner";
import { listCurrentUserCaseSummaries } from "@/lib/server/cases/service";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();

  const cases = await listCurrentUserCaseSummaries();

  return (
    <div className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-ink text-paper">
      <header className="border-b border-paper/15">
        <div className="flex h-14 w-full items-center justify-between px-6 lg:px-8">
          <Link href="/" className="font-heading text-2xl uppercase leading-none">
            Murdock
          </Link>
          <nav className="flex items-center gap-4 text-sm text-paper/70">
            <ModeSwitcher />
          </nav>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-hidden">
        <AppFrame cases={cases}>{children}</AppFrame>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
