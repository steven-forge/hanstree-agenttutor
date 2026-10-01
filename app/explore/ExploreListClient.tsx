"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import rawExplore from "../../data/explore.json";

type ExploreDoc = {
  slug: string;
  title: string;
  summary: string;
  topic: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

const exploreDocs = (rawExplore as unknown as { docs: ExploreDoc[] }).docs;
const TOPICS = ["전체", ...Array.from(new Set(exploreDocs.map((doc) => doc.topic)))];

export default function ExploreListClient() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTopic, setSelectedTopic] = useState("전체");

  const filteredDocs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return exploreDocs
      .filter((doc) => {
        if (selectedTopic !== "전체" && doc.topic !== selectedTopic) return false;
        if (!query) return true;
        return (
          doc.title.toLowerCase().includes(query) ||
          doc.summary.toLowerCase().includes(query) ||
          doc.tags.some((tag) => tag.toLowerCase().includes(query))
        );
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [searchQuery, selectedTopic]);

  const hasAnyDocs = exploreDocs.length > 0;
  const isFiltered = Boolean(searchQuery) || selectedTopic !== "전체";

  return (
    <div>
      <section className="search-bar-wrap" aria-label="Explore 문서 검색 및 필터">
        <input
          type="search"
          className="search-input"
          placeholder="문서 검색 (제목, 요약, 태그)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Explore 문서 검색"
        />
        <select
          className="category-select"
          value={selectedTopic}
          onChange={(e) => setSelectedTopic(e.target.value)}
          aria-label="주제 선택"
        >
          {TOPICS.map((topic) => (
            <option key={topic} value={topic}>
              {topic === "전체" ? "모든 주제 보기" : topic}
            </option>
          ))}
        </select>
      </section>

      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }} aria-live="polite">
          총 <strong>{exploreDocs.length}</strong>개 문서 중 <strong>{filteredDocs.length}</strong>개 표시
        </span>
        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedTopic("전체");
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--blue)",
              cursor: "pointer",
              fontSize: "0.85rem",
              textDecoration: "underline"
            }}
          >
            필터 초기화
          </button>
        )}
      </div>

      {filteredDocs.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
            {hasAnyDocs ? "검색 결과가 없습니다." : "아직 등록된 문서가 없습니다."}
          </p>
          <p>
            {hasAnyDocs
              ? "검색어를 확인하거나 주제 필터를 '모든 주제 보기'로 변경해 보세요."
              : "완성된 설명 문서가 이곳에 모입니다."}
          </p>
        </div>
      ) : (
        <div className="glossary-list">
          {filteredDocs.map((doc) => (
            <Link key={doc.slug} href={`/explore/${doc.slug}`} className="glossary-card" style={{ display: "block", textDecoration: "none" }}>
              <div className="glossary-header">
                <strong style={{ fontSize: "1.05rem", color: "var(--ink)" }}>{doc.title}</strong>
                <span className="badge" style={{ margin: 0 }}>{doc.topic}</span>
              </div>
              <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: "0.92rem", lineHeight: "1.6" }}>
                {doc.summary}
              </p>
              <div className="glossary-meta-row" style={{ marginTop: "12px" }}>
                {doc.tags.map((tag) => (
                  <span key={tag} className="tag-link">#{tag}</span>
                ))}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: "0.78rem", color: "#9ca3af" }}>
                수정일 · {doc.updated_at}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
