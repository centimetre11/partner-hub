import type { Metadata, Viewport } from "next";
import "./globals.css";
import { getLocale } from "@/lib/i18n/locale-server";

export const metadata: Metadata = {
  title: "Fanruan MEA Partner Hub",
  description: "AI-native partner management for Fanruan Middle East & Africa",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"} className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
