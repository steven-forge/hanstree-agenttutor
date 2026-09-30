"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AgentDoc, Source } from "../content";

type AgentModel = {
  id: string;
  name: string;
  input_cost: number | null;
  output_cost: number | null;
  cache_read_cost: number | null;
  context_window: string;
  max_output: string;
  key_feature: string;
  minimum_access: string;
  access_source: string;
  sources: Source[];
  price_note: string;
  input_modalities?: string;
  released_at?: string;
  release_source?: string;
  effort_levels?: string[];
  effort_note?: string;
  effort_source?: Source[];
  codex_modes?: string[];
};

const NEW_BADGE_DAYS = 30;

function isNewModel(releasedAt: string | undefined): boolean {
  if (!releasedAt) return false;
  const releaseDate = new Date(`${releasedAt}T00:00:00Z`);
  const now = new Date();
  const diffDays = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < NEW_BADGE_DAYS;
}

type ModelEntry = {
  model: AgentModel;
  agent: AgentDoc;
  input_modalities: string;
  effort_source: Source[];
  effort_note?: string;
};

type CompareRow = {
  key: string;
  label: string;
  cell: (entry: ModelEntry) => ReactNode;
  text: (entry: ModelEntry) => string;
};

type AgentModelGroup = {
  agent_slug: string;
  input_modalities: string;
  models: AgentModel[];
  effort_source?: Source[];
  effort_note?: string;
};

const MAX_SELECTED = 5;
const MAX_LISTED = 6;

function formatUsd(value: number | null): string {
  return value === null || value === undefined ? "공식 미확인" : `$${value}`;
}

function formatContextWindow(value: string): string {
  return value === "1,050,000" || value === "1,048,576" ? "1M" : value;
}

function sourcesText(sources: Source[]): string {
  return sources.map((s) => `${s.name} (${s.url})`).join("; ");
}

const COMPARE_ROWS: CompareRow[] = [
  {
    key: "model_id",
    label: "API 모델 ID",
    cell: ({ model }) => <code>{model.id}</code>,
    text: ({ model }) => model.id
  },
  {
    key: "input_modalities",
    label: "모델 문서상 입력 유형",
    cell: ({ input_modalities }) => input_modalities,
    text: ({ input_modalities }) => input_modalities
  },
  {
    key: "minimum_access",
    label: "별도 크레딧 없는 최소 이용 비용",
    cell: ({ model }) => (
      <>
        {model.minimum_access}
        <br />
        <a href={model.access_source} target="_blank" rel="noopener noreferrer">요금제 근거 ↗</a>
      </>
    ),
    text: ({ model }) => `${model.minimum_access} (${model.access_source})`
  },
  {
    key: "input_cost",
    label: "입력 토큰 비용 (1M당)",
    cell: ({ model }) => formatUsd(model.input_cost),
    text: ({ model }) => formatUsd(model.input_cost)
  },
  {
    key: "output_cost",
    label: "출력 토큰 비용 (1M당)",
    cell: ({ model }) => formatUsd(model.output_cost),
    text: ({ model }) => formatUsd(model.output_cost)
  },
  {
    key: "context_window",
    label: "컨텍스트 크기",
    cell: ({ model }) => formatContextWindow(model.context_window),
    text: ({ model }) => formatContextWindow(model.context_window)
  },
  {
    key: "max_output",
    label: "최대 출력",
    cell: ({ model }) => model.max_output,
    text: ({ model }) => model.max_output
  },
  {
    key: "cache_read_cost",
    label: "캐시(읽기) 비용 (1M당)",
    cell: ({ model }) => formatUsd(model.cache_read_cost),
    text: ({ model }) => formatUsd(model.cache_read_cost)
  },
  {
    key: "key_feature",
    label: "주요 특징",
    cell: ({ model }) => model.key_feature,
    text: ({ model }) => model.key_feature
  },
  {
    key: "effort_levels",
    label: "지원 effort (추론 수준)",
    cell: ({ model, effort_note, effort_source }) => (
      <>
        {model.codex_modes && model.codex_modes.length > 0 ? "API: " : ""}
        {model.effort_levels === undefined
          ? "공식 미확인"
          : model.effort_levels.length > 0
            ? model.effort_levels.join(" · ")
            : "설정 미지원"}
        {model.codex_modes && model.codex_modes.length > 0 && (
          <>
            <br />
            {`Codex 추가 모드: ${model.codex_modes.join(" · ")}`}
          </>
        )}
        {effort_note && (
          <>
            <br />
            <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>{effort_note}</span>
          </>
        )}
        {effort_source.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", color: "var(--blue)", fontSize: ".78rem" }}
          >
            {source.name} ↗
          </a>
        ))}
      </>
    ),
    text: ({ model, effort_note, effort_source }) => {
      const levels =
        model.effort_levels === undefined
          ? "공식 미확인"
          : model.effort_levels.length > 0
            ? model.effort_levels.join(" · ")
            : "설정 미지원";
      const prefix = model.codex_modes && model.codex_modes.length > 0 ? "API: " : "";
      const codexModes =
        model.codex_modes && model.codex_modes.length > 0
          ? ` Codex 추가 모드: ${model.codex_modes.join(" · ")}`
          : "";
      const note = effort_note ? ` (${effort_note})` : "";
      const source = effort_source.length > 0 ? ` ${sourcesText(effort_source)}` : "";
      return `${prefix}${levels}${codexModes}${note}${source}`;
    }
  },
  {
    key: "price_note",
    label: "가격 조건",
    cell: ({ model }) => (
      <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>{model.price_note}</span>
    ),
    text: ({ model }) => model.price_note
  },
  {
    key: "sources",
    label: "공식 출처",
    cell: ({ model }) => (
      <>
        {model.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "block", color: "var(--blue)", fontWeight: 600, fontSize: ".82rem" }}
          >
            {source.name} ↗
          </a>
        ))}
      </>
    ),
    text: ({ model }) => sourcesText(model.sources)
  }
];

function escapeCsvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export default function ModelComparison({
  agents,
  modelGroups,
  unitNote
}: {
  agents: AgentDoc[];
  modelGroups: AgentModelGroup[];
  unitNote: string;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [hiddenRowKeys, setHiddenRowKeys] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");

  const modelsById = useMemo(() => {
    const map = new Map<string, ModelEntry>();
    for (const group of modelGroups) {
      const agent = agents.find((a) => a.slug === group.agent_slug);
      if (!agent) continue;
      for (const model of group.models.slice(0, MAX_LISTED)) {
        map.set(model.id, {
          model,
          agent,
          input_modalities: model.input_modalities ?? group.input_modalities,
          effort_source: model.effort_source ?? group.effort_source ?? [],
          effort_note: model.effort_note ?? group.effort_note
        });
      }
    }
    return map;
  }, [agents, modelGroups]);

  const selectedModels = selectedIds
    .map((id) => modelsById.get(id))
    .filter((entry): entry is ModelEntry => Boolean(entry));

  const visibleRows = COMPARE_ROWS.filter((row) => !hiddenRowKeys.includes(row.key));

  const limitReached = selectedIds.length >= MAX_SELECTED;

  function toggleModel(id: string) {
    setCopyStatus("idle");
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  }

  function toggleRow(key: string) {
    setCopyStatus("idle");
    setHiddenRowKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  function buildMarkdown(): string {
    const escapeMarkdown = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const header = ["항목", ...selectedModels.map(({ model, agent }) => `${agent.title} · ${model.name}`)];
    const separator = header.map(() => "---");
    const rows = visibleRows.map((row) => [row.label, ...selectedModels.map((entry) => row.text(entry))]);
    const lines = [header, separator, ...rows].map((cols) => `| ${cols.map(escapeMarkdown).join(" | ")} |`);
    return lines.join("\n");
  }

  function buildCsv(): string {
    const header = ["항목", ...selectedModels.map(({ model, agent }) => `${agent.title} · ${model.name}`)];
    const rows = visibleRows.map((row) => [row.label, ...selectedModels.map((entry) => row.text(entry))]);
    return [header, ...rows].map((cols) => cols.map(escapeCsvCell).join(",")).join("\r\n");
  }

  async function copyMarkdown() {
    const markdown = buildMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      setCopyStatus("success");
    } catch {
      setCopyStatus("error");
    }
  }

  function downloadCsv() {
    const csv = buildCsv();
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "model-comparison.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <p className="section-note" style={{ marginBottom: "10px" }}>{unitNote}</p>
      <p className="section-note" style={{ marginBottom: "10px" }}>NEW는 공식 출시일로부터 30일 미만인 모델에 표시됩니다.</p>

      <div aria-live="polite" className="filter-count">
        {selectedIds.length}/{MAX_SELECTED}개 모델 선택됨
        {limitReached && " · 최대 5개까지 선택할 수 있습니다. 다른 모델을 보려면 먼저 선택을 해제하세요."}
      </div>

      <div className="model-picker-grid">
        {modelGroups.map((group) => {
          const agent = agents.find((a) => a.slug === group.agent_slug);
          if (!agent) return null;
          return (
            <fieldset key={group.agent_slug} className="model-picker-fieldset">
              <legend className="model-picker-legend">
                <a href={`/agents/${agent.slug}`}>{agent.title}</a> <span className="agent-provider-tag">{agent.provider}</span>
              </legend>
              <div className="model-picker-list">
                {group.models.slice(0, MAX_LISTED).map((model) => {
                  const checked = selectedIds.includes(model.id);
                  const disabled = !checked && limitReached;
                  return (
                    <label
                      key={model.id}
                      className={`model-picker-item${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleModel(model.id)}
                      />
                      <span className="model-picker-name-wrap">
                        <span className="model-picker-name">
                          <span className="model-picker-name-text" title={model.name}>{model.name}</span>
                          {isNewModel(model.released_at) && (
                            <span
                              className="new-badge"
                              title={`${model.released_at} 출시${model.release_source ? ` · ${model.release_source}` : ""}`}
                            >
                              NEW
                            </span>
                          )}
                        </span>
                        {model.released_at ? (
                          <time dateTime={model.released_at} className="model-picker-release-date">
                            {`출시일 ${model.released_at}`}
                          </time>
                        ) : (
                          <span className="model-picker-release-date">출시일 미확인</span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>

      <div style={{ marginTop: "28px" }}>
        <h3 style={{ margin: "0 0 10px" }}>선택한 모델 비교</h3>
        {selectedModels.length === 0 ? (
          <div className="empty-state" role="status" aria-live="polite">
            <p>
              <strong>아직 선택한 모델이 없습니다.</strong>
            </p>
            <p style={{ marginTop: "6px" }}>위 목록에서 모델을 선택하면 비교표가 여기에 표시됩니다.</p>
          </div>
        ) : (
          <div className="model-compare-wrap" tabIndex={0} role="region" aria-label="선택한 모델 비교표">
            <p className="section-note" style={{ marginBottom: "8px" }}>
              API 모델 ID·입력 유형은 API 스펙 기준이며, 실제 앱 UI에서 파일 업로드가 되는지 여부와는 다를 수 있습니다.
            </p>
            <p className="section-note" style={{ marginBottom: "8px" }}>
              최소 이용 비용은 별도 크레딧 구매 없이 이용 가능한 구독·무료 티어 기준입니다. 포함 사용량 초과 시 추가 과금될 수 있으며, API 종량제와 앱 구독은 별개입니다.
            </p>

            <details className="model-picker-fieldset" style={{ marginBottom: "12px" }}>
              <summary className="model-picker-legend">표시할 비교 항목</summary>
              <div className="model-picker-list">
                {COMPARE_ROWS.map((row) => (
                  <label key={row.key} className="model-picker-item">
                    <input
                      type="checkbox"
                      checked={!hiddenRowKeys.includes(row.key)}
                      onChange={() => toggleRow(row.key)}
                      aria-label={`${row.label} 행 표시 여부`}
                    />
                    <span>{row.label}</span>
                  </label>
                ))}
              </div>
            </details>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
              <button type="button" className="filter-submit-btn" onClick={copyMarkdown}>
                마크다운 복사
              </button>
              <button type="button" className="filter-submit-btn" onClick={downloadCsv}>
                엑셀(CSV) 다운로드
              </button>
            </div>
            <div aria-live="polite" className="filter-count">
              {copyStatus === "success" && "비교표를 마크다운으로 클립보드에 복사했습니다."}
              {copyStatus === "error" && "클립보드 복사에 실패했습니다. 브라우저 권한을 확인하거나 직접 선택해 복사해 주세요."}
            </div>

            <table className="model-compare-table">
              <thead>
                <tr>
                  <th scope="col">항목</th>
                  {selectedModels.map(({ model, agent }) => (
                    <th scope="col" key={model.id}>
                      {agent.title} · {model.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {selectedModels.map((entry) => (
                      <td key={entry.model.id}>{row.cell(entry)}</td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">선택 해제</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>
                      <button
                        type="button"
                        className="filter-reset-link"
                        onClick={() => toggleModel(model.id)}
                        aria-label={`${model.name} 비교에서 제거`}
                      >
                        제거
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginTop: "36px" }} id="agent-overview-table">
        <h3 style={{ margin: "0 0 10px" }}>에이전트 목록형 비교</h3>
        <div className="table-wrap agents-table-wrap" tabIndex={0} role="region" aria-label="에이전트 비교 목록">
          <table className="agents-table">
            <thead>
              <tr>
                <th scope="col">에이전트 · 개발사</th>
                <th scope="col">제공 형태</th>
                <th scope="col">도구 방식</th>
                <th scope="col">핵심 강점 &amp; 적합한 상황</th>
                <th scope="col">공식 출처 · 검토일</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.slug} className="agent-table-row">
                  <td>
                    <a href={`/agents/${agent.slug}`} className="agent-row-link"><strong>{agent.title}</strong></a>
                    <span className="agent-provider-tag">{agent.provider}</span>
                  </td>
                  <td>
                    <div className="agent-badges-wrap">
                      {agent.form_factors.map((f) => (
                        <span
                          key={f.type}
                          className={f.status === "공식지원확인" ? "status-confirmed" : f.status.startsWith("조건부") ? "status-conditional" : "status-unconfirmed"}
                          style={{ fontSize: "0.72rem", padding: "1px 6px" }}
                        >
                          {f.type}: {f.status}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div className="agent-badges-wrap">
                      {agent.tool_modes && agent.tool_modes.length > 0 ? agent.tool_modes.map((mode) => (
                        <span key={mode} className="badge-concept" style={{ fontSize: "0.72rem", padding: "1px 6px" }}>{mode}</span>
                      )) : <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>-</span>}
                    </div>
                  </td>
                  <td style={{ fontSize: "0.88rem", color: "#374151" }}>{agent.tagline}</td>
                  <td style={{ fontSize: "0.8rem", color: "var(--muted)" }}>
                    <div>
                      {agent.sources.length > 0 && (
                        <a
                          href={agent.sources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--blue)", textDecoration: "none", fontWeight: 600 }}
                          aria-label={`${agent.title} 공식 출처 (${agent.sources[0].name})`}
                        >공식 문서 ↗</a>
                      )}
                    </div>
                    <time dateTime={agent.reviewed_at} style={{ display: "block", marginTop: "2px" }}>
                      {agent.reviewed_at.split("T")[0]}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
