import Link from "next/link";

export default function PublicLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      {children}
      <Link
        aria-label="Open Murdock on GitHub"
        className="hover-theme-invert fixed bottom-4 right-4 z-50 flex h-10 items-center justify-center border border-paper/20 bg-ink px-3 font-heading text-sm uppercase text-paper shadow-lg shadow-black/30 transition-colors"
        href="https://github.com/dunkeln/murdock"
        rel="noreferrer"
        target="_blank"
      >
        GitHub
      </Link>
    </>
  );
}
