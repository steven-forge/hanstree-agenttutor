export type NavItem = {
  title: string;
  href: string;
  children?: NavItem[];
};

export type NavGroup = {
  title: string;
  href?: string;
  items: NavItem[];
};

export const TOP_NAV_LINKS: NavItem[] = [
  { title: "Today", href: "/today" },
  { title: "Learn", href: "/learn" },
  { title: "Explore", href: "/explore" },
  { title: "Agent Engineering", href: "/agent-engineering" },
  { title: "Agents", href: "/agents" },
  { title: "CLI Docs", href: "/docs/hanstree" },
  { title: "Glossary", href: "/glossary" }
];

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "News",
    href: "/today",
    items: [
      { title: "Newsletter", href: "/today" },
      { title: "Releases", href: "/releases" },
      { title: "카드뉴스 관리", href: "/admin/news", children: [
        { title: "Explore 웹툰 발행", href: "/admin/news/explore" },
        { title: "뉴스레터 기준 설정", href: "/admin/news/settings" },
        { title: "Instagram 연결", href: "/admin/news/instagram" }
      ] }
    ]
  },
  {
    title: "Learn",
    href: "/learn",
    items: [
      { title: "Roadmap", href: "/learn" },
      { title: "1. Agent Basics", href: "/learn/agent-basics" },
      { title: "2. LLM", href: "/learn/llm" },
      { title: "3. Prompt", href: "/learn/prompt" },
      { title: "4. Context", href: "/learn/context" },
      { title: "5. Memory", href: "/learn/memory" },
      { title: "6. Agent Pattern", href: "/learn/agent-pattern" },
      {
        title: "AI의 작동 방식 이해하기",
        href: "/learn#ai-behavior",
        children: [
          { title: "1. AI의 네 가지 특성", href: "/learn/ai-behavior/the-4-properties-of-ai" },
          { title: "2. AI 활용 능력의 4D 행동 지표", href: "/learn/ai-behavior/the-4-ds-of-ai-fluency-behavioral-indicators" },
          { title: "3. AI와 대화할 때 내부에서 일어나는 일", href: "/learn/ai-behavior/what-happens-when-you-talk-to-ai" },
          { title: "4. AI 답변을 믿어도 될까?", href: "/learn/ai-behavior/can-you-trust-what-ai-tells-you" },
          { title: "5. AI는 나에 대해 무엇을 알까?", href: "/learn/ai-behavior/what-does-ai-know-about-me" },
          { title: "6. AI는 왜 환각을 일으킬까?", href: "/learn/ai-behavior/why-do-ai-models-hallucinate" },
          { title: "7. AI의 아첨 성향이란?", href: "/learn/ai-behavior/what-is-sycophancy-in-ai-models" },
          { title: "8. AI에는 왜 편향이 생길까?", href: "/learn/ai-behavior/why-does-bias-exist-in-ai-models" },
          { title: "9. AI 활용 책임 설명문 작성하기", href: "/learn/ai-behavior/writing-an-ai-diligence-statement" },
          { title: "10. 토큰: 입력마다 비용이 다른 이유", href: "/learn/ai-behavior/tokens-and-embeddings" },
          { title: "11. 컨텍스트가 Claude 성능과 비용에 미치는 영향", href: "/learn/ai-behavior/parametric-memory-and-context" },
          { title: "12. 사람들이 Claude의 작업을 확인하는 방법", href: "/learn/ai-behavior/discernment-toolkit" }
        ]
      }
    ]
  },
  {
    title: "Explore",
    href: "/explore",
    items: [
      { title: "All Documents", href: "/explore" }
    ]
  },
  {
    title: "Agent Engineering",
    href: "/agent-engineering",
    items: [
      { title: "Overview", href: "/agent-engineering" },
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
    title: "Agents",
    href: "/agents",
    items: [
      { title: "Comparison", href: "/agents" },
      { title: "Claude", href: "/agents/claude" },
      { title: "Codex", href: "/agents/codex" },
      { title: "Gemini", href: "/agents/gemini" },
      { title: "Grok", href: "/agents/grok" },
      { title: "DeepSeek", href: "/agents/deepseek" },
      { title: "Muse", href: "/agents/muse" },
      { title: "Qwen", href: "/agents/qwen" },
      { title: "GLM", href: "/agents/glm" }
    ]
  },
  {
    title: "CLI Docs",
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
      { title: "Glossary", href: "/glossary" }
    ]
  }
];

export function resolveCurrentPath(activeSlug?: string, currentPath?: string): string {
  if (currentPath) return currentPath;
  if (!activeSlug) return "/";
  if (activeSlug.startsWith("/")) return activeSlug;
  return `/docs/${activeSlug}`;
}
