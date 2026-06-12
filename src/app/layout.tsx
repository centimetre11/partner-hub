import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "帆软中东伙伴管理系统",
  description: "AI 原生的中东区合作伙伴管理系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
