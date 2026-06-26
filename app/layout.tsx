import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mリーグ式 麻雀スコア管理",
  description: "Mリーグ式の順位点とオカで半荘結果を記録・管理するアプリ",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
