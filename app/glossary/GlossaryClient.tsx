"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import rawGlossary from "../../data/glossary.json";
import type { GlossaryTerm } from "../content";

const glossaryTerms = (rawGlossary as unknown as { terms: GlossaryTerm[] }).terms;
const CATEGORIES = ["전체", "기본 개념", "구성 요소", "구조·운영", "제품·실행"] as const;

export default function GlossaryClient() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("전체");
  const [activeHash, setActiveHash] = useState("");

  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.replace("#", "");
      setActiveHash(hash);
      if (!hash) return;

      const target = glossaryTerms.find((t) => t.id === hash);
      if (target) {
        // Reset category filter only when needed
        setSelectedCategory((prev) => {
          if (prev !== "전체" && prev !== target.category) {
            return "전체";
          }
          return prev;
        });

        // Reset search query only when needed
        setSearchQuery((prev) => {
          if (!prev) return prev;
          const q = prev.toLowerCase();
          const match =
            target.term.toLowerCase().includes(q) ||
            target.korean.toLowerCase().includes(q) ||
            target.aliases.some((a) => a.toLowerCase().includes(q)) ||
            target.definition.toLowerCase().includes(q);
          return match ? prev : "";
        });
      }
    };

    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const filteredTerms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return [...glossaryTerms].reverse().filter((term) => {
      if (selectedCategory !== "전체" && term.category !== selectedCategory) {
        return false;
      }
      if (!query) return true;
      return (
        term.term.toLowerCase().includes(query) ||
        term.korean.toLowerCase().includes(query) ||
        term.aliases.some((a) => a.toLowerCase().includes(query)) ||
        term.definition.toLowerCase().includes(query)
      );
    });
  }, [searchQuery, selectedCategory]);

  // Effect after render to scroll and focus matching term with tabIndex=-1
  useEffect(() => {
    if (!activeHash) return;
    const el = document.getElementById(activeHash);
    if (!el) return;

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    el.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "start"
    });
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
  }, [activeHash]);

  return (
    <div>
      <section className="search-bar-wrap" aria-label="용어 검색 및 필터">
        <input
          type="search"
          className="search-input"
          placeholder="용어 검색 (영문, 한국어, 별칭, 예: Agent, 에이전트, RAG)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="용어 검색"
        />
        <select
          className="category-select"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          aria-label="분류 선택"
        >
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat === "전체" ? "모든 분류 보기" : cat}
            </option>
          ))}
        </select>
      </section>

      <div style={{ marginBottom: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
          총 <strong>{glossaryTerms.length}</strong>개 용어 중 <strong>{filteredTerms.length}</strong>개 표시 · 최신 등록순
        </span>
        {(searchQuery || selectedCategory !== "전체") && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("전체");
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

      {filteredTerms.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--ink)" }}>
            검색 결과가 없습니다.
          </p>
          <p>검색어를 확인하거나 분류 필터를 '모든 분류 보기'로 변경해 보세요.</p>
        </div>
      ) : (
        <div className="glossary-list">
          {filteredTerms.map((item) => {
            const isHighlighted = activeHash === item.id;

            return (
              <article
                key={item.id}
                id={item.id}
                tabIndex={-1}
                className={`glossary-card ${isHighlighted ? "term-highlight" : ""}`}
              >
                <div className="glossary-header">
                  <div>
                    <span className="glossary-term">{item.term}</span>
                    {item.is_new && (
                      <span className="new-badge" role="img" aria-label="새로 추가된 용어" style={{ marginLeft: "6px" }}>
                        NEW
                      </span>
                    )}
                    <span className="glossary-korean">{item.korean}</span>
                  </div>
                  <span className="badge" style={{ margin: 0 }}>
                    {item.category}
                  </span>
                </div>

                {item.aliases.length > 0 && (
                  <div className="glossary-aliases">
                    별칭: {item.aliases.join(", ")}
                  </div>
                )}

                <div className="glossary-def">
                  <strong>정의:</strong> {item.definition}
                </div>

                <div className="glossary-example">
                  <strong>쉬운 예시:</strong> {item.example}
                </div>

                {/* 관련 용어 이동 */}
                {item.related_ids.length > 0 && (
                  <div className="glossary-meta-row">
                    <span>관련 용어:</span>
                    {item.related_ids.map((relId) => (
                      <a key={relId} href={`#${relId}`} className="tag-link">
                        #{relId}
                      </a>
                    ))}
                  </div>
                )}

                {/* 관련 학습 문서 링크 (왕복) */}
                {item.links.length > 0 && (
                  <div className="glossary-meta-row" style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--line)" }}>
                    <span style={{ fontWeight: 600, color: "var(--ink)" }}>관련 학습 문서:</span>
                    {item.links.map((link) => (
                      <Link key={link.href} href={link.href} className="tag-link" style={{ background: "var(--mint-soft)", color: "var(--mint)" }}>
                        {link.label} →
                      </Link>
                    ))}
                  </div>
                )}

                {/* 출처 */}
                {item.sources.length > 0 && (
                  <div style={{ marginTop: "10px", fontSize: "0.78rem", color: "var(--muted)" }}>
                    출처:{" "}
                    {item.sources.map((s, idx) => (
                      <span key={s.url}>
                        {idx > 0 && ", "}
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)", textDecoration: "underline" }}>
                          {s.name}
                        </a>
                      </span>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
