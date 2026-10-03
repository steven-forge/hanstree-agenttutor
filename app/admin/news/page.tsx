import type { Metadata } from "next";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { isAdmin, setupStatus, snapshot } from "../../lib/card-news/server";
import { kstDate } from "../../lib/card-news/types";
import AdminNews from "./AdminNews";
import AdminLogin from "./AdminLogin";
import "./admin-news.css";

export const metadata: Metadata = { title: "카드뉴스 관리 | AgentTutor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function CardNewsAdmin({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams, date = kstDate(), setup = setupStatus();
  let admin = false, unavailable = false;
  let initial = { edition: null, setup: { auth: false, storage: false, instagram: false, scheduler: false }, history: [] } as Awaited<ReturnType<typeof snapshot>>;
  try { admin = await isAdmin(); if (admin) initial = await snapshot(date); } catch { unavailable = true; admin = false; }
  return <><SiteHeader /><div className="docs-shell card-news-layout"><DocsSidebar currentPath="/admin/news" /><div style={{ minWidth: 0 }}>
    {unavailable && <p role="status">서버 저장소에 연결하지 못했습니다. 브라우저 작업 공간은 계속 사용할 수 있습니다.</p>}
    {mode === "server" && !admin ? <AdminLogin setup={setup} /> : <AdminNews initial={initial} initialDate={date} localMode={!admin} />}
  </div></div></>;
}
