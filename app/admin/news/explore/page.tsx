import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "../../../SiteHeader";
import DocsSidebar from "../../../DocsSidebar";
import { isAdmin, setupStatus, snapshot, validDate } from "../../../lib/card-news/server";
import { exploreOptions } from "../../../lib/card-news/explore-edition";
import { kstDate, type AdminSnapshot } from "../../../lib/card-news/types";
import AdminNews from "../AdminNews";
import AdminLogin from "../AdminLogin";
import "../admin-news.css";

export const metadata: Metadata = { title: "Explore 웹툰 발행 | AgentTutor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function ExploreCardsPage({ searchParams }: { searchParams: Promise<{ date?: string; explore?: string }> }) {
  const params = await searchParams, setup = setupStatus();
  let date: string;
  try { date = validDate(params.date || kstDate()); } catch { notFound(); }
  let admin = false;
  try { admin = await isAdmin(); } catch { admin = false; }
  const options = admin ? exploreOptions() : [];
  const selected = params.explore ? options.find(doc => doc.slug === params.explore) : options[0];
  const explore = selected ? { ...selected, format: "webtoon" as const } : undefined;
  if (admin && !explore) notFound();
  let initial: AdminSnapshot | null = null;
  if (admin && explore && setup.storage) {
    try { initial = await snapshot(`${date}~webtoon~${explore.slug}`); } catch { /* Keep server-only drafts protected while storage is unavailable. */ }
  }
  const workflow = admin && !!initial && !!explore;
  return <><SiteHeader currentPath="/admin/news/explore" /><div className={`docs-shell card-news-layout${workflow ? " cn-daily-layout" : ""}`}><DocsSidebar currentPath="/admin/news/explore" /><div className={workflow ? "cn-daily-route" : undefined} style={{ minWidth: 0 }}>
    {!admin ? <AdminLogin setup={{ auth: setup.auth, authIssue: setup.authIssue, storage: false, instagram: false, scheduler: false }} title="Explore 웹툰 발행" description="관리자 비밀번호를 확인한 뒤 Explore에 만들어진 웹툰을 골라 Instagram에 발행할 수 있습니다." /> : initial && explore ? <AdminNews initial={initial} initialDate={date} explore={explore} exploreDocs={options} /> : <main className="cn-shell"><h1>Explore 웹툰 발행</h1><p>Explore 원고를 보관하려면 서버 저장소 연결이 필요합니다. 저장소 상태를 확인한 뒤 다시 열어 주세요.</p><a href="/admin/news">카드뉴스 관리로 돌아가기</a></main>}
  </div></div></>;
}
