import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "AgentTutor", description: "AI 도구 명령어 문서 모아보기" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
