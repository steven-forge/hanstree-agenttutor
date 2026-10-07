import type { Metadata } from "next";
import SiteHeader from "../../SiteHeader";
import DocsSidebar from "../../DocsSidebar";
import { isAdmin, setupStatus, snapshot, validDate } from "../../lib/card-news/server";
import { exploreOptions } from "../../lib/card-news/explore-edition";
import { notFound } from "next/navigation";
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
  let admin = false, unavailable = false;
  // Authentication must succeed before either server or browser drafts can be shown.
  try { admin = await isAdmin(); } catch { admin = false; }
  const options = admin ? exploreOptions() : [];
  const explore = admin && params.explore ? options.find(doc => doc.slug === params.explore) : undefined;
  if (admin && params.explore && !explore) notFound();
  let localMode = !setup.storage;
  let initial = { edition: null, setup: { ...setup, auth: admin, storage: false }, history: [] } as Awaited<ReturnType<typeof snapshot>>;
  if (admin && setup.storage) {
    try { initial = await snapshot(explore ? `${date}~explore~${explore.slug}` : date); }
    catch { unavailable = true; localMode = true; }
  }
  return <><SiteHeader currentPath="/admin/news" /><div className="docs-shell card-news-layout"><DocsSidebar currentPath="/admin/news" /><div style={{ minWidth: 0 }}>
    {admin && unavailable && !explore && <p role="status">서버 저장소에 연결하지 못했습니다. 로그인한 관리자는 브라우저에 저장된 원고로 작업할 수 있습니다.</p>}
    {admin && explore && localMode ? <main className="cn-shell"><h1>Explore 카드 발행</h1><p>Explore 원고를 보관하려면 서버 저장소 연결이 필요합니다. 저장소 상태를 확인한 뒤 다시 열어 주세요.</p><a href="/admin/news">카드뉴스 관리로 돌아가기</a></main> : admin ? <AdminNews initial={initial} initialDate={date} localMode={localMode} explore={explore} exploreDocs={options} /> : <AdminLogin setup={{ auth: setup.auth, authIssue: setup.authIssue, storage: false, instagram: false, scheduler: false }} />}
  </div></div></>;
}
