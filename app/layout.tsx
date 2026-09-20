import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AgentTutor",
  description: "Today 일일 브리핑, Learn 기초 개념, Agent Engineering 실무 가이드, Agents 제품 비교, 명령어 문서 및 Glossary 핵심 용어사전을 포괄하는 AI Agent 종합 학습 플랫폼"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
