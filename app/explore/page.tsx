import type { Metadata } from "next";
import SiteHeader from "../SiteHeader";
import DocsSidebar from "../DocsSidebar";

export const metadata: Metadata = {
  title: "Explore · AgentTutor",
  description: "궁금한 내용을 쉬운 설명과 그림, 직접 조작하는 예제로 알아보세요."
};

export default function ExplorePage() {
  return (
    <>
      <SiteHeader currentPath="/explore" />
      <div className="docs-shell">
        <DocsSidebar currentPath="/explore" />
        <main className="doc-main" role="main">
          <header className="home-hero" id="overview">
            <p className="brand-kicker">EXPLORE</p>
            <h1>Explore</h1>
            <p>궁금한 내용을 쉬운 설명과 그림, 직접 조작하는 예제로 알아보세요.</p>
          </header>

          <section style={{ marginTop: "32px" }} id="documents">
            <h2>전체 문서 (0)</h2>
            <div className="empty-state" style={{ marginTop: "16px" }}>
              <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
                아직 등록된 문서가 없습니다.
              </p>
              <p>완성된 설명 문서가 이곳에 모입니다.</p>
            </div>
          </section>
        </main>

        <aside className="page-outline">
          <p>이 페이지에서</p>
          <nav aria-label="페이지 목차">
            <a href="#overview">개요</a>
            <a href="#documents">전체 문서</a>
          </nav>
        </aside>
      </div>
    </>
  );
}
