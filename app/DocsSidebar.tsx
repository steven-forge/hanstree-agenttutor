import Link from "next/link";
import docs from "../data/docs.json";
import pkg from "../package.json";

export default function DocsSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <aside className="docs-sidebar">
      <nav aria-label="개요">
        <Link
          aria-current={!activeSlug ? "page" : undefined}
          className={!activeSlug ? "selected" : ""}
          href="/"
        >
          Overview
        </Link>
      </nav>
      <p>명령어 문서</p>
      <nav aria-label="문서 목록">
        {docs.documents.map((item) => (
          <Link
            aria-current={item.slug === activeSlug ? "page" : undefined}
            className={item.slug === activeSlug ? "selected" : ""}
            href={`/docs/${item.slug}`}
            key={item.slug}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      <footer>
        <span>공식 출처를 매일 확인합니다.</span>
        <span>v{pkg.version}</span>
      </footer>
    </aside>
  );
}
