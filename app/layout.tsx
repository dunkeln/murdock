import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter, Oswald } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Murdock",
  description: "A focused legal workflow assessment for Glade.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full",
        "antialiased",
        geistSans.variable,
        geistMono.variable,
        "font-sans",
        inter.variable,
        oswald.variable
      )}
    >
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
