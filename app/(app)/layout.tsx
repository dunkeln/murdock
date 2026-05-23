import Link from "next/link";

import { AppFrame } from "@/components/app/app-frame";
import { ModeSwitcher } from "@/components/app/mode-switcher";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-ink text-paper">
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
      <main>
        <AppFrame>{children}</AppFrame>
      </main>
    </div>
  );
}
