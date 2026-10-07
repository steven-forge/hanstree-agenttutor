import type { Metadata } from "next";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { isAdmin, setupStatus, snapshot, validDate } from "../../lib/card-news/server";
import { notFound, redirect } from "next/navigation";
import { kstDate } from "../../lib/card-news/types";
import AdminNews from "./AdminNews";
import AdminLogin from "./AdminLogin";
import "./admin-news.css";

export const metadata: Metadata = { title: "카드뉴스 관리 | AgentTutor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function CardNewsAdmin({ searchParams }: { searchParams: Promise<{ date?: string; explore?: string }> }) {
  const params = await searchParams, setup = setupStatus();
  let date: string;
  try { date = validDate(params.date || kstDate()); } catch { notFound(); }
  if (params.explore) redirect(`/admin/news/explore?${new URLSearchParams({ date, explore: params.explore })}`);
  let admin = false, unavailable = false;
  // Authentication must succeed before either server or browser drafts can be shown.
  try { admin = await isAdmin(); } catch { admin = false; }
  let localMode = !setup.storage;
  let initial = { edition: null, setup: { ...setup, auth: admin, storage: false }, history: [] } as Awaited<ReturnType<typeof snapshot>>;
  if (admin && setup.storage) {
    try { initial = await snapshot(date); }
    catch { unavailable = true; localMode = true; }
  }
  return <><SiteHeader currentPath="/admin/news" /><div className="docs-shell card-news-layout"><DocsSidebar currentPath="/admin/news" /><div style={{ minWidth: 0 }}>
    {admin && unavailable && <p role="status">서버 저장소에 연결하지 못했습니다. 로그인한 관리자는 브라우저에 저장된 원고로 작업할 수 있습니다.</p>}
    {admin ? <AdminNews initial={initial} initialDate={date} localMode={localMode} /> : <AdminLogin setup={{ auth: setup.auth, authIssue: setup.authIssue, storage: false, instagram: false, scheduler: false }} />}
  </div></div></>;
}
