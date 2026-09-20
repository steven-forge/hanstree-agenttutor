import rawLearn from "../data/learn.json";
import rawEngineering from "../data/agent-engineering.json";
import rawAgents from "../data/agents.json";
import rawGlossary from "../data/glossary.json";
import rawToday from "../data/today.json";
import rawHealth from "../data/content-health.json";
import rawDocs from "../data/docs.json";

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
};

export type TodayArticle = {
  id: string;
  title: string;
  summary?: string;
  why_it_matters?: string;
  source_summary?: string;
  source_id: string;
  source_name: string;
  source_url: string;
  published_at?: string;
  published_on?: string;
  date_precision?: "time" | "day";
  fetched_at?: string;
};

export type TodayData = {
  edition_date: string | null;
  window_start: string | null;
  window_end: string | null;
  collected_at: string | null;
  reviewed_at: string | null;
  articles: TodayArticle[];
};

export type ContentHealthSource = {
  id?: string;
  name?: string;
  url: string;
  status: string;
  error?: string;
  count?: number;
  held_count?: number;
  skipped_count?: number;
  excluded_count?: number;
  coverage_limited?: boolean;
  checked_at?: string;
  changed_at?: string;
};

export type ContentHealthData = {
  news: {
    checked_at: string | null;
    status: "not_collected" | "ok" | "partial" | "failed";
    candidate_count: number;
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
export const agentsMetadata = {
  reviewed_at: (rawAgents as unknown as { reviewed_at: string }).reviewed_at,
  updated_at: (rawAgents as unknown as { updated_at: string }).updated_at
};
export const glossaryTerms = (rawGlossary as unknown as { terms: GlossaryTerm[] }).terms;
export const todayData = rawToday as unknown as TodayData;
export const contentHealth = rawHealth as unknown as ContentHealthData;
export const commandDocs = (rawDocs as unknown as { documents: { slug: string; title: string; description: string }[] }).documents;

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
