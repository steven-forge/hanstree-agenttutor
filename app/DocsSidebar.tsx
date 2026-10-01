import Link from "next/link";
import pkg from "../package.json";
import { NAV_GROUPS, resolveCurrentPath } from "./nav";

export default function DocsSidebar({ activeSlug, currentPath }: { activeSlug?: string; currentPath?: string }) {
  const current = resolveCurrentPath(activeSlug, currentPath);

  return (
    <aside className="docs-sidebar">
      <nav aria-label="Overview">
        <Link
          aria-current={current === "/" ? "page" : undefined}
          className={current === "/" ? "selected" : ""}
          href="/"
        >
          Overview
        </Link>
      </nav>
      {NAV_GROUPS.map((group) => (
        <details
          key={group.title}
          className="sidebar-group"
          open={
            group.items.some((item) => item.href === current || item.children?.some((child) => child.href === current)) ||
            (group.href !== undefined && current.startsWith(`${group.href}/`))
          }
        >
          <summary>{group.title}</summary>
          <nav aria-label={`${group.title} navigation`}>
            {group.items.map((item) => {
              const isSelected = item.href === current;
              return (
                <div key={item.title} className="sidebar-item-group">
                  <Link
                    aria-current={isSelected ? "page" : undefined}
                    className={isSelected ? "selected" : ""}
                    href={item.href}
                  >
                    {item.title}
                  </Link>
                  {item.children && (
                    <div className="sidebar-nested">
                      {item.children.map((child) => {
                        const isChildSelected = child.href === current;
                        return (
                          <Link
                            key={child.href}
                            aria-current={isChildSelected ? "page" : undefined}
                            className={isChildSelected ? "selected" : ""}
                            href={child.href}
                          >
                            {child.title}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
        </details>
      ))}
      <footer>
        <span>공식 출처를 주기적으로 확인합니다.</span>
        <span>v{pkg.version}</span>
      </footer>
    </aside>
  );
}
