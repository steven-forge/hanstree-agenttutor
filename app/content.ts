import rawLearn from "../data/learn.json";
import rawEngineering from "../data/agent-engineering.json";
import rawAgents from "../data/agents.json";
import rawGlossary from "../data/glossary.json";
import rawToday from "../data/today.json";
import rawHealth from "../data/content-health.json";
import rawDocs from "../data/docs.json";
import rawAiBehavior from "../data/ai-behavior.json";
import rawNewsEditorial from "../data/news-editorial.json";

export type Source = {
  name: string;
  url: string;
};

export type LearnDoc = {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  definition: string;
  easy_example: {
    title?: string;
    content: string;
  };
  flow_steps: {
    title: string;
    description: string;
  }[];
  common_mistakes: {
    mistake: string;
    solution: string;
  }[];
  next_steps: string;
  related_glossary_ids: string[];
  sources: Source[];
  reviewed_at: string;
  updated_at: string;
};

export type AIBehaviorDoc = {
  slug: string;
  title: string;
  original_title: string;
  order: number;
  summary: string;
  key_points: string[];
  practice_tip: string;
  source: Source;
  video?: {
    url: string;
    embed_url: string;
    title: string;
    summary: string;
  };
};

export type AgentEngineeringDoc = {
  id: string;
  slug: string;
  title: string;
  description: string;
  order: number;
  what: string;
  when_to_use: string;
  key_components: {
    name: string;
    description: string;
  }[];
  minimal_example: {
    title: string;
    is_product_example: boolean;
    language: string;
    code: string;
    note?: string;
  };
  failure_and_permissions: string[];
  selection_criteria: string[];
  comparison_table?: {
    caption: string;
    headers: string[];
    rows: string[][];
  };
  special_section?: {
    title: string;
    content: string;
    items?: { label: string; desc: string }[];
  };
  related_glossary_ids: string[];
  sources: Source[];
  reviewed_at: string;
  updated_at: string;
};

export type AgentDoc = {
  id: string;
  slug: string;
  title: string;
  provider: string;
  tool_modes: ("MCP" | "IDE" | "Terminal")[];
  tagline: string;
  suitable_for: string[];
  workflow_and_strengths: string[];
  cautions: string[];
  form_factors: {
    type: "App" | "CLI" | "API";
    status: "공식지원확인" | "조건부" | "미확인";
    notes: string;
  }[];
  differences: string;
  sources: Source[];
  reviewed_at: string;
  updated_at: string;
};

export type GlossaryTerm = {
  id: string;
  term: string;
  korean: string;
  aliases: string[];
  category: "기본 개념" | "구성 요소" | "구조·운영" | "제품·실행" | "기타";
  definition: string;
  example: string;
  related_ids: string[];
  links: { label: string; href: string }[];
  sources: Source[];
  is_new?: boolean;
};

export type TodayArticle = {
  id: string;
  title: string;
  title_ko?: string;
  summary?: string;
  why_it_matters: string;
  source_summary?: string;
  source_summary_ko?: string;
  // 원문 <article>/<main> 전체 본문에서 만든 추출형 3문장 요약일 때만 "article_full_text_3line"
  source_summary_provenance?: "article_full_text_3line";
  // 자동 추출·자동 번역한 짧은 원문 인용(<=25단어)+한국어 번역. 사람의 편집 검토가 아니다.
  source_excerpt?: { original: string; ko: string };
  // source_excerpt를 만들지 못한 이유(본문 접근 실패/본문 부족/적합 문장 없음/번역 실패 등).
  source_excerpt_error?: string;
  keywords_ko?: string[];
  key_points_ko?: string[];
  source_id: string;
  source_name: string;
  source_url: string;
  published_at?: string;
  published_on?: string;
  date_precision?: "time" | "day";
  fetched_at?: string;
  release_notes_ko?: {
    new_features?: string;
    bug_fixes?: string;
    chores?: string;
  };
  // 매시간 외부 매체 수집이 채우는 필드. 독립 출처 2곳 이상이면 normal, 3곳 이상이면 high.
  importance?: "normal" | "high";
  independent_source_count?: number;
  sources?: {
    source_id: string;
    name: string;
    url: string;
    target_url?: string;
    independent: boolean;
  }[];
  // 자동 생성 이후 편집 필드(title/summary/why_it_matters)가 실제 변경됐을 때만 publish_news.py가 기록한다.
  // 이 기사 개별 편집 기록이며, todayData.reviewed_at(전체 판본 시각)과는 다른 뜻이다. 사람이 직접 확인했다는 보장은 아니다.
  reviewed_at?: string;
  // 새로 생성될 때만 설정. 과거 기존 해설은 이 필드가 없으며 '작성 방식 기록 없음'으로 표시한다.
  why_it_matters_provenance?: "automatic" | "editorial";
};

export type TodayData = {
  edition_date: string | null;
  window_start: string | null;
  window_end: string | null;
  collected_at: string | null;
  reviewed_at: string | null;
  articles: TodayArticle[];
};

export type NewsTopic = "model" | "tools" | "safety";

export type ArticleEditorial = {
  reviewed_at: string;
  reviewed_by: string;
  review_scope: string;
  topics?: NewsTopic[];
  related_glossary_ids?: string[];
  check_now?: {
    text: string;
    audience: string;
    caveat: string;
    source_url: string;
  };
  // 원문을 직접 대조해 작성한 재구성 요약. 원문 전체 번역이 아니다.
  reading?: {
    summary_ko: string;
    sections: { heading: string; body: string }[];
    excerpt?: { original: string; ko: string };
    source_url: string;
    checked_at: string;
    reviewed_by?: string;
  };
};

export type WeeklyEditorial = {
  id: string;
  start_date: string;
  end_date: string;
  reviewed_at: string;
  reviewed_by: string;
  title: string;
  summary: string;
  article_ids: string[];
};

export type StoryEditorial = {
  id: string;
  title: string;
  reviewed_at: string;
  reviewed_by: string;
  introduction: string;
  interpretation: string;
  entries: { date: string; article_id: string; fact: string }[];
};

export type NewsEditorialData = {
  articles?: Record<string, ArticleEditorial>;
  weekly?: WeeklyEditorial;
  story?: StoryEditorial;
};

export type OfficialRunTelemetry = {
  waiting_count?: number;
  policy_revision?: number;
  policy_updated_at?: string | null;
  daily_target?: number;
  published_today?: number;
  shortfall?: number;
  collected_at: string;
  window_start: string;
  window_end: string;
  candidate_count: number;
  published_count: number;
  held_item_count: number;
  failed_source_count: number;
  checked_source_count: number;
};

export type HourlyRunTelemetry = {
  policy_revision?: number;
  policy_updated_at?: string | null;
  daily_target?: number;
  published_today?: number;
  shortfall?: number;
  collected_at: string;
  window_start: string;
  window_end: string;
  candidate_count: number;
  eligible_count: number;
  published_count: number;
  waiting_count: number;
  held_count: number;
  duplicate_count: number;
  held_item_count: number;
  failed_source_count: number;
  checked_source_count: number;
  not_configured_source_count: number;
  min_independent: number;
};

export type ContentHealthSource = {
  id?: string;
  name?: string;
  url: string;
  status: string;
  error?: string;
  count?: number;
  held_count?: number;
  held_reasons?: string[];
  skipped_count?: number;
  excluded_count?: number;
  coverage_limited?: boolean;
  checked_at?: string;
  last_success_at?: string;
  changed_at?: string;
};

export type ContentHealthData = {
  news: {
    checked_at: string | null;
    status: "not_collected" | "ok" | "partial" | "failed";
    candidate_count: number;
    archive_count?: number;
    pending_event_count?: number;
    sources: ContentHealthSource[];
  };
  documents: {
    checked_at: string | null;
    sources: ContentHealthSource[];
  };
};

export const learnDocs = (rawLearn as unknown as { documents: LearnDoc[] }).documents;
export const engineeringDocs = (rawEngineering as unknown as { documents: AgentEngineeringDoc[] }).documents;
export const agentDocs = (rawAgents as unknown as { documents: AgentDoc[] }).documents;
export type AgentOverview = Pick<AgentDoc, "slug" | "title" | "provider" | "tool_modes" | "tagline" | "form_factors" | "sources" | "reviewed_at">;
export const overviewOnlyAgents = (rawAgents as unknown as { overview_only: AgentOverview[] }).overview_only;
export const agentsMetadata = {
  reviewed_at: (rawAgents as unknown as { reviewed_at: string }).reviewed_at,
  updated_at: (rawAgents as unknown as { updated_at: string }).updated_at
};
export const glossaryTerms = (rawGlossary as unknown as { terms: GlossaryTerm[] }).terms;
export const todayData = rawToday as unknown as TodayData;
export const contentHealth = rawHealth as unknown as ContentHealthData;
export const commandDocs = (rawDocs as unknown as { documents: { slug: string; title: string; description: string }[] }).documents;
export const aiBehaviorDocs = rawAiBehavior as AIBehaviorDoc[];
export const newsEditorial = rawNewsEditorial as unknown as NewsEditorialData;

export const NEWS_TOPIC_LABELS: Record<NewsTopic, string> = {
  model: "모델",
  tools: "도구",
  safety: "안전",
};

export function isDocFreshnessWarning(
  doc: { reviewed_at: string; sources: Source[] },
  docSources: ContentHealthSource[] = contentHealth.documents.sources,
  referenceDateIso: string = contentHealth.documents.checked_at || new Date().toISOString()
): boolean {
  const reviewedMs = Date.parse(doc.reviewed_at);
  const refMs = Date.parse(referenceDateIso);
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

  if (!isNaN(reviewedMs) && !isNaN(refMs) && refMs - reviewedMs > THIRTY_DAYS_MS) {
    return true;
  }

  return doc.sources.some((source) => {
    const match = docSources.find((s) => s.url.replace(/\/$/, "") === source.url.replace(/\/$/, ""));
    if (!match) return false;
    if (match.status === "failed") return true;
    if (match.changed_at) {
      const changedMs = Date.parse(match.changed_at);
      if (!isNaN(changedMs) && !isNaN(reviewedMs) && changedMs > reviewedMs) {
        return true;
      }
    }
    return false;
  });
}
