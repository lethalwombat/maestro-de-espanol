import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { THEME_SCRIPT } from "@/components/ui/theme";
import "./globals.css";

// Self-hosted from /_next/static/media/: browsers never contact Google.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Maestro de Español",
  description: "Practise writing Spanish with instant, explained corrections.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme before React hydrates.
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
