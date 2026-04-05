import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "stAIpler — Turn Any AI Agent Into a Subject Expert",
  description: "stAIpler scans your project, finds missing instruction layers, and optimizes your agent's context with AI. Same model, dramatically better results.",
  metadataBase: new URL("https://staipler.com"),
  openGraph: {
    title: "stAIpler — Turn Any AI Agent Into a Subject Expert",
    description: "Scan your project, find missing instruction layers, and optimize your agent's context. Works with Claude, Codex, Copilot, Cursor, and every major AI tool.",
    url: "https://staipler.com",
    siteName: "stAIpler",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "stAIpler — Turn Any AI Agent Into a Subject Expert",
    description: "Your AI agent is flying blind. stAIpler scans, analyzes, and optimizes your instruction context. Open source.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full bg-[#06060e] text-slate-200 antialiased font-[family-name:var(--font-inter)]">
        {children}
      </body>
    </html>
  );
}
