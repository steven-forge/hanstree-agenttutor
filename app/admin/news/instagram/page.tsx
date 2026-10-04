import type { Metadata } from "next";
import SiteHeader from "../../../SiteHeader";
import DocsSidebar from "../../../DocsSidebar";
import { isAdmin, setupStatus } from "../../../lib/card-news/server";
import { connectionView, type ConnectionView } from "../../../lib/card-news/instagram-connection";
import AdminLogin from "../AdminLogin";
import InstagramConnection from "./InstagramConnection";
import "../admin-news.css";

export const metadata: Metadata = { title: "Instagram 연결 | AgentTutor", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export default async function InstagramConnectionPage() {
  const setup = setupStatus();
  let admin = false;
  try { admin = await isAdmin(); } catch { admin = false; }
  let initial: ConnectionView | null = null;
  if (admin) { try { initial = await connectionView(); } catch { initial = null; } }
  return <><SiteHeader currentPath="/admin/news/instagram" /><div className="docs-shell card-news-layout"><DocsSidebar currentPath="/admin/news/instagram" /><div style={{ minWidth: 0 }}>
    {admin ? <InstagramConnection initial={initial} /> : <AdminLogin setup={{ auth: setup.auth, authIssue: setup.authIssue, storage: false, instagram: false, scheduler: false }} title="Instagram 연결" description="관리자 비밀번호를 확인한 뒤 Instagram 계정 연결 상태를 관리할 수 있습니다." />}
  </div></div></>;
}
