import Link from "next/link";

import { PageContainer } from "@/components/layout/page-container";

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <PageContainer className="flex h-14 items-center justify-between">
          <Link href="/" className="text-sm font-medium">
            Murdock
          </Link>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/dashboard">Dashboard</Link>
          </nav>
        </PageContainer>
      </header>
      <main>
        <PageContainer className="py-8">{children}</PageContainer>
      </main>
    </div>
  );
}
