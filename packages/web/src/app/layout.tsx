import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "stAIpler — Context Optimization for AI Agents",
  description: "Scan your project, find missing instruction layers, and optimize your agent's context with AI. Same model, dramatically better results.",
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
