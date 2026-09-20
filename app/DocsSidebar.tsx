import Link from "next/link";
import pkg from "../package.json";
import { NAV_GROUPS, resolveCurrentPath } from "./nav";

export default function DocsSidebar({ activeSlug, currentPath }: { activeSlug?: string; currentPath?: string }) {
  const current = resolveCurrentPath(activeSlug, currentPath);

  return (
    <aside className="docs-sidebar">
      <nav aria-label="개요">
        <Link
          aria-current={current === "/" ? "page" : undefined}
          className={current === "/" ? "selected" : ""}
          href="/"
        >
          Overview
        </Link>
      </nav>
      {NAV_GROUPS.map((group) => (
        <section key={group.title} className="sidebar-group">
          <p>{group.title}</p>
          <nav aria-label={`${group.title} 목록`}>
            {group.items.map((item) => {
              const isSelected = item.href === current;
              return (
                <Link
                  key={item.href}
                  aria-current={isSelected ? "page" : undefined}
                  className={isSelected ? "selected" : ""}
                  href={item.href}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </section>
      ))}
      <footer>
        <span>공식 출처를 주기적으로 확인합니다.</span>
        <span>v{pkg.version}</span>
      </footer>
    </aside>
  );
}
