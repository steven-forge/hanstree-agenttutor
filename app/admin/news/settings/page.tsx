import type { Metadata } from "next";
import SiteHeader from "../../../SiteHeader";
import DocsSidebar from "../../../DocsSidebar";
import { isAdmin, setupStatus } from "../../../lib/card-news/server";
import AdminLogin from "../AdminLogin";
import NewsPolicySettings from "../NewsPolicySettings";
import "../admin-news.css";

export const metadata: Metadata = { title: "뉴스레터 기준 설정 | AgentTutor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function NewsletterSettingsPage() {
  const setup = setupStatus();
  let admin = false;
  try { admin = await isAdmin(); } catch { admin = false; }
  return <><SiteHeader currentPath="/admin/news/settings" /><div className="docs-shell card-news-layout"><DocsSidebar currentPath="/admin/news/settings" /><div style={{ minWidth: 0 }}>
    {admin ? <NewsPolicySettings /> : <AdminLogin setup={{ auth: setup.auth, authIssue: setup.authIssue, storage: false, instagram: false, scheduler: false }} title="뉴스레터 기준 설정" description="관리자 비밀번호를 확인한 뒤 뉴스 수집과 게시 기준을 관리할 수 있습니다." />}
  </div></div></>;
}
