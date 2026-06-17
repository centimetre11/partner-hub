import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fanruan MEA Partner Hub",
  description: "AI-native partner management for Fanruan Middle East & Africa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
