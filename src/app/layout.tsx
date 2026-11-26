import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maestro de Español",
  description: "Practise writing Spanish with instant, explained corrections.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
