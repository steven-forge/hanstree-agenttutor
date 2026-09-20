export type NavItem = {
  title: string;
  href: string;
};

export type NavGroup = {
  title: string;
  href?: string;
  items: NavItem[];
};

export const TOP_NAV_LINKS: NavItem[] = [
  { title: "Today", href: "/today" },
  { title: "Learn", href: "/learn" },
  { title: "Agent Engineering", href: "/agent-engineering" },
  { title: "Agents", href: "/agents" },
  { title: "명령어 문서", href: "/docs/hanstree" },
  { title: "Glossary", href: "/glossary" }
];

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Today",
    href: "/today",
    items: [
      { title: "오늘의 10대 뉴스", href: "/today" }
    ]
  },
  {
    title: "Learn (기초 개념)",
    href: "/learn",
    items: [
      { title: "학습 로드맵 개요", href: "/learn" },
      { title: "1. Agent 기본", href: "/learn/agent-basics" },
      { title: "2. LLM", href: "/learn/llm" },
      { title: "3. Prompt", href: "/learn/prompt" },
      { title: "4. Context", href: "/learn/context" },
      { title: "5. Memory", href: "/learn/memory" },
      { title: "6. Agent Pattern", href: "/learn/agent-pattern" }
    ]
  },
  {
    title: "Agent Engineering",
    href: "/agent-engineering",
    items: [
      { title: "엔지니어링 개요", href: "/agent-engineering" },
      { title: "Skills", href: "/agent-engineering/skills" },
      { title: "Hooks", href: "/agent-engineering/hooks" },
      { title: "Tools", href: "/agent-engineering/tools" },
      { title: "MCP", href: "/agent-engineering/mcp" },
      { title: "Plugins", href: "/agent-engineering/plugins" },
      { title: "Commands", href: "/agent-engineering/commands" },
      { title: "Sub Agents", href: "/agent-engineering/sub-agents" },
      { title: "Memory", href: "/agent-engineering/memory" },
      { title: "Context Management", href: "/agent-engineering/context-management" }
    ]
  },
  {
    title: "Agents (제품 비교)",
    href: "/agents",
    items: [
      { title: "에이전트 비교 개요", href: "/agents" },
      { title: "Claude", href: "/agents/claude" },
      { title: "Codex", href: "/agents/codex" },
      { title: "Gemini", href: "/agents/gemini" },
      { title: "Grok", href: "/agents/grok" }
    ]
  },
  {
    title: "명령어 문서",
    href: "/docs/hanstree",
    items: [
      { title: "Hanstree", href: "/docs/hanstree" },
      { title: "Codex CLI", href: "/docs/codex" },
      { title: "Claude Code", href: "/docs/claude" },
      { title: "Gemini CLI", href: "/docs/gemini" },
      { title: "Antigravity CLI", href: "/docs/antigravity" },
      { title: "Grok CLI", href: "/docs/grok" }
    ]
  },
  {
    title: "Glossary",
    href: "/glossary",
    items: [
      { title: "용어사전", href: "/glossary" }
    ]
  }
];

export function resolveCurrentPath(activeSlug?: string, currentPath?: string): string {
  if (currentPath) return currentPath;
  if (!activeSlug) return "/";
  if (activeSlug.startsWith("/")) return activeSlug;
  return `/docs/${activeSlug}`;
}
