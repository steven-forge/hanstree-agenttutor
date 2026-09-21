import Link from "next/link";
import { TOP_NAV_LINKS, NAV_GROUPS, resolveCurrentPath } from "./nav";

export default function SiteHeader({ activeSlug, currentPath }: { activeSlug?: string; currentPath?: string }) {
  const current = resolveCurrentPath(activeSlug, currentPath);

  return (
    <header className="site-header">
      <Link className="site-brand" href="/" aria-label="AgentTutor 홈으로 이동">
        <span aria-hidden="true">A</span>AgentTutor
      </Link>
      <nav className="header-links" aria-label="상단 메뉴">
        {TOP_NAV_LINKS.map((link) => {
          const isSelected = link.href.startsWith("/docs")
            ? current.startsWith("/docs")
            : current === link.href || (link.href !== "/" && current.startsWith(link.href));
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isSelected ? "page" : undefined}
              className={isSelected ? "header-link-active" : undefined}
            >
              {link.title}
            </Link>
          );
        })}
      </nav>
      <details key={current} className="mobile-nav">
        <summary aria-label="전체 메뉴 열기">메뉴</summary>
        <nav aria-label="모바일 전체 메뉴">
          <Link aria-current={current === "/" ? "page" : undefined} href="/">
            Overview (홈)
          </Link>
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mobile-nav-group">
              <p className="mobile-group-title">{group.title}</p>
              {group.items.map((item) => (
                <div key={item.title}>
                  <Link
                    aria-current={item.href === current ? "page" : undefined}
                    href={item.href}
                  >
                    {item.title}
                  </Link>
                  {item.children && (
                    <div className="mobile-nav-nested">
                      {item.children.map((child) => (
                        <Link
                          key={child.href}
                          aria-current={child.href === current ? "page" : undefined}
                          href={child.href}
                        >
                          {child.title}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </details>
    </header>
  );
}
