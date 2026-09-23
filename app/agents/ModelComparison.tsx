"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AgentDoc, Source } from "../content";

type AgentModel = {
  id: string;
  name: string;
  input_cost: number;
  output_cost: number;
  cache_read_cost: number;
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
  effort_default?: string;
};

const DEFAULT_EFFORT = "medium";
const EFFORT_LABELS: Record<string, string> = {
  none: "None",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra high (xhigh)",
  max: "Max"
};
const effortLabel = (level: string) => EFFORT_LABELS[level] ?? level;
const REASONING_GUIDE_URL = "https://developers.openai.com/api/docs/guides/reasoning";

const NEW_BADGE_DAYS = 30;

function isNewModel(releasedAt: string | undefined): boolean {
  if (!releasedAt) return false;
  const releaseDate = new Date(`${releasedAt}T00:00:00Z`);
  const now = new Date();
  const diffDays = (now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < NEW_BADGE_DAYS;
}

type ModelEntry = { model: AgentModel; agent: AgentDoc; input_modalities: string };

type CompareRow = {
  key: string;
  label: string;
  cell: (entry: ModelEntry) => ReactNode;
  text: (entry: ModelEntry) => string;
};

type AgentModelGroup = { agent_slug: string; input_modalities: string; models: AgentModel[] };

const MAX_SELECTED = 5;
const MAX_LISTED = 6;

function formatUsd(value: number): string {
  return `$${value}`;
}

// ponytail: 짧은 컨텍스트만 계산; 장문 요금이 필요해지면 모델별 요율을 추가한다.
const LONG_CONTEXT_TOKEN_LIMIT = 272_000;

type ParsedTokenCount = { value: number | null; status: "empty" | "ok" | "invalid" };

function parseTokenCount(raw: string): ParsedTokenCount {
  const trimmed = raw.trim();
  if (trimmed === "") return { value: null, status: "empty" };
  const num = Number(trimmed);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0 || num > Number.MAX_SAFE_INTEGER) {
    return { value: null, status: "invalid" };
  }
  return { value: num, status: "ok" };
}

function formatCostUsd(value: number): string {
  const v = Object.is(value, -0) ? 0 : value;
  if (v === 0) return "$0.00";
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(v);
  const fixed = abs.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
  const [intPart, decPart = ""] = fixed.split(".");
  const paddedDec = decPart.length < 2 ? decPart.padEnd(2, "0") : decPart;
  return `${sign}$${intPart}.${paddedDec}`;
}

function mutedNote(text: string): ReactNode {
  return <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>{text}</span>;
}

type CostResult = { ok: boolean; text: string };

function sourcesText(sources: Source[]): string {
  return sources.map((s) => `${s.name} (${s.url})`).join("; ");
}

const BASE_COMPARE_ROWS: CompareRow[] = [
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
    cell: ({ model }) => model.context_window,
    text: ({ model }) => model.context_window
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
  const [effortByModelId, setEffortByModelId] = useState<Record<string, string>>({});
  const [normalInputRaw, setNormalInputRaw] = useState("");
  const [cacheReadRaw, setCacheReadRaw] = useState("");
  const [displayOutputRaw, setDisplayOutputRaw] = useState("");
  const [reasoningTokensByKey, setReasoningTokensByKey] = useState<Record<string, string>>({});

  function setEffort(modelId: string, value: string) {
    setCopyStatus("idle");
    setEffortByModelId((prev) => ({ ...prev, [modelId]: value }));
  }

  function setReasoningTokens(modelId: string, effort: string, value: string) {
    setCopyStatus("idle");
    setReasoningTokensByKey((prev) => ({ ...prev, [`${modelId}::${effort}`]: value }));
  }

  const normalInput = useMemo(() => parseTokenCount(normalInputRaw), [normalInputRaw]);
  const cacheReadInput = useMemo(() => parseTokenCount(cacheReadRaw), [cacheReadRaw]);
  const displayOutputInput = useMemo(() => parseTokenCount(displayOutputRaw), [displayOutputRaw]);

  const longContextExceeded =
    normalInput.value != null &&
    cacheReadInput.value != null &&
    normalInput.value + cacheReadInput.value > LONG_CONTEXT_TOKEN_LIMIT;

  const sharedTokenStatus: "ok" | "incomplete" | "invalid" | "long_context" =
    [normalInput, cacheReadInput, displayOutputInput].some((p) => p.status === "invalid")
      ? "invalid"
      : longContextExceeded
        ? "long_context"
        : [normalInput, cacheReadInput, displayOutputInput].some((p) => p.status === "empty")
          ? "incomplete"
          : "ok";

  function currentEffort(model: AgentModel): string {
    const levels = model.effort_levels;
    if (!levels || levels.length === 0) return DEFAULT_EFFORT;
    const value = effortByModelId[model.id] ?? DEFAULT_EFFORT;
    return levels.includes(value) ? value : levels[0];
  }

  function reasoningTokensFor(modelId: string, effort: string): ParsedTokenCount {
    return parseTokenCount(reasoningTokensByKey[`${modelId}::${effort}`] ?? "");
  }

  function baseCostResult(model: AgentModel): CostResult {
    if (sharedTokenStatus === "invalid") return { ok: false, text: "입력값 오류" };
    if (sharedTokenStatus === "long_context") return { ok: false, text: "산출 불가 (272K 초과)" };
    if (sharedTokenStatus === "incomplete") return { ok: false, text: "입력 필요" };
    const cost =
      (normalInput.value! * model.input_cost +
        cacheReadInput.value! * model.cache_read_cost +
        displayOutputInput.value! * model.output_cost) /
      1_000_000;
    return { ok: true, text: formatCostUsd(cost) };
  }

  function reasoningCostResult(model: AgentModel): CostResult {
    const levels = model.effort_levels;
    if (!levels || levels.length === 0) return { ok: false, text: "추론 비용 미산출 (effort 정보 없음)" };
    const effort = currentEffort(model);
    const parsed = reasoningTokensFor(model.id, effort);
    if (parsed.status === "invalid") return { ok: false, text: "입력값 오류" };
    if (parsed.status === "empty") return { ok: false, text: "입력 필요" };
    const cost = (parsed.value! * model.output_cost) / 1_000_000;
    return { ok: true, text: formatCostUsd(cost) };
  }

  function totalCostResult(model: AgentModel): CostResult {
    const base = baseCostResult(model);
    const levels = model.effort_levels;
    if (!levels || levels.length === 0) return { ok: false, text: "추론 비용 미산출 (effort 정보 없음)" };
    if (!base.ok) return base;
    const reasoning = reasoningCostResult(model);
    if (!reasoning.ok) return reasoning;
    const baseValue =
      (normalInput.value! * model.input_cost +
        cacheReadInput.value! * model.cache_read_cost +
        displayOutputInput.value! * model.output_cost) /
      1_000_000;
    const reasoningValue = (reasoningTokensFor(model.id, currentEffort(model)).value! * model.output_cost) / 1_000_000;
    return { ok: true, text: formatCostUsd(baseValue + reasoningValue) };
  }

  function mediumDiffResult(model: AgentModel): CostResult {
    const levels = model.effort_levels;
    if (!levels || levels.length === 0 || !levels.includes(DEFAULT_EFFORT)) return { ok: false, text: "해당 없음" };
    const effort = currentEffort(model);
    if (effort === DEFAULT_EFFORT) return { ok: true, text: formatCostUsd(0) };
    const mediumParsed = reasoningTokensFor(model.id, DEFAULT_EFFORT);
    if (mediumParsed.status !== "ok") return { ok: false, text: "Medium 추론 토큰 입력 필요" };
    const currentParsed = reasoningTokensFor(model.id, effort);
    if (currentParsed.status !== "ok") return { ok: false, text: "입력 필요" };
    const diff = ((currentParsed.value! - mediumParsed.value!) * model.output_cost) / 1_000_000;
    return { ok: true, text: formatCostUsd(diff) };
  }

  const compareRows = useMemo<CompareRow[]>(() => {
    const effortRow: CompareRow = {
      key: "reasoning_effort",
      label: "추론 강도 (effort)",
      cell: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0) {
          return <span style={{ fontSize: ".82rem", color: "var(--muted)" }}>제공사별 방식 상이 · 비교 대상 아님</span>;
        }
        const value = effortByModelId[model.id] ?? DEFAULT_EFFORT;
        const defaultNote = model.effort_default
          ? `공식 기본값: ${effortLabel(model.effort_default)}`
          : `공식 기본값 미확인 · 비교 시작값: ${effortLabel(DEFAULT_EFFORT)}`;
        return (
          <div>
            <select
              className="filter-select"
              style={{ width: "100%", minWidth: "100px" }}
              value={levels.includes(value) ? value : levels[0]}
              onChange={(e) => setEffort(model.id, e.target.value)}
              aria-label={`${model.name} 추론 강도(effort) 선택`}
            >
              {levels.map((level) => (
                <option key={level} value={level}>{effortLabel(level)}</option>
              ))}
            </select>
            <div style={{ fontSize: ".76rem", color: "var(--muted)", marginTop: "2px" }}>{defaultNote}</div>
          </div>
        );
      },
      text: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0) return "비교 대상 아님";
        const value = effortByModelId[model.id] ?? DEFAULT_EFFORT;
        const selected = effortLabel(levels.includes(value) ? value : levels[0]);
        const defaultNote = model.effort_default
          ? `공식 기본값: ${effortLabel(model.effort_default)}`
          : `공식 기본값 미확인 · 비교 시작값: ${effortLabel(DEFAULT_EFFORT)}`;
        return `${selected} (${defaultNote})`;
      }
    };
    const mediumReasoningTokensRow: CompareRow = {
      key: "reasoning_tokens_medium",
      label: "Medium 기준 추론 토큰",
      cell: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0 || !levels.includes(DEFAULT_EFFORT)) return mutedNote("해당 없음");
        const key = `${model.id}::${DEFAULT_EFFORT}`;
        const raw = reasoningTokensByKey[key] ?? "";
        const parsed = parseTokenCount(raw);
        return (
          <div>
            <input
              type="text"
              inputMode="numeric"
              className="filter-select"
              style={{ width: "100%", minWidth: "90px" }}
              value={raw}
              placeholder="예: 512"
              aria-label={`${model.name} Medium 추론 토큰 입력`}
              onChange={(e) => setReasoningTokens(model.id, DEFAULT_EFFORT, e.target.value)}
            />
            {parsed.status === "invalid" && (
              <div style={{ fontSize: ".76rem", color: "var(--red, #b91c1c)", marginTop: "2px" }}>
                0 이상의 정수만 입력할 수 있습니다.
              </div>
            )}
          </div>
        );
      },
      text: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0 || !levels.includes(DEFAULT_EFFORT)) return "해당 없음";
        const parsed = reasoningTokensFor(model.id, DEFAULT_EFFORT);
        if (parsed.status === "empty") return "미입력";
        if (parsed.status === "invalid") return "입력값 오류";
        return String(parsed.value);
      }
    };
    const reasoningTokensRow: CompareRow = {
      key: "reasoning_tokens_input",
      label: "선택 effort 추론 토큰",
      cell: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0) return mutedNote("해당 없음");
        const effort = currentEffort(model);
        if (effort === DEFAULT_EFFORT) return mutedNote("Medium 기준과 동일");
        const key = `${model.id}::${effort}`;
        const raw = reasoningTokensByKey[key] ?? "";
        const parsed = parseTokenCount(raw);
        return (
          <div>
            <input
              type="text"
              inputMode="numeric"
              className="filter-select"
              style={{ width: "100%", minWidth: "90px" }}
              value={raw}
              placeholder="예: 512"
              aria-label={`${model.name} ${effortLabel(effort)} 추론 토큰 입력`}
              onChange={(e) => setReasoningTokens(model.id, effort, e.target.value)}
            />
            {parsed.status === "invalid" && (
              <div style={{ fontSize: ".76rem", color: "var(--red, #b91c1c)", marginTop: "2px" }}>
                0 이상의 정수만 입력할 수 있습니다.
              </div>
            )}
          </div>
        );
      },
      text: ({ model }) => {
        const levels = model.effort_levels;
        if (!levels || levels.length === 0) return "해당 없음";
        const effort = currentEffort(model);
        const parsed = reasoningTokensFor(model.id, effort);
        if (parsed.status === "empty") return "미입력";
        if (parsed.status === "invalid") return "입력값 오류";
        return String(parsed.value);
      }
    };
    const appliedRatesRow: CompareRow = {
      key: "applied_rates",
      label: "적용 단가 · 공통 토큰 가정 (근거)",
      cell: ({ model }) => (
        <span style={{ fontSize: ".78rem", color: "var(--muted)" }}>
          입력 {formatUsd(model.input_cost)} · 캐시읽기 {formatUsd(model.cache_read_cost)} · 출력(추론 포함) {formatUsd(model.output_cost)} (1M당)
          <br />
          가정 — 일반입력 {normalInput.status === "ok" ? normalInput.value : "미입력"} · 캐시읽기{" "}
          {cacheReadInput.status === "ok" ? cacheReadInput.value : "미입력"} · 화면출력{" "}
          {displayOutputInput.status === "ok" ? displayOutputInput.value : "미입력"}
        </span>
      ),
      text: ({ model }) =>
        `입력 ${formatUsd(model.input_cost)} · 캐시읽기 ${formatUsd(model.cache_read_cost)} · 출력 ${formatUsd(model.output_cost)} (1M당); ${tokenAssumptionText()}`
    };
    const baseCostRow: CompareRow = {
      key: "base_cost",
      label: "기본 예상 비용 (추론 제외)",
      cell: ({ model }) => {
        const r = baseCostResult(model);
        return r.ok ? r.text : mutedNote(r.text);
      },
      text: ({ model }) => baseCostResult(model).text
    };
    const reasoningCostRow: CompareRow = {
      key: "reasoning_cost",
      label: "추론 추가 비용",
      cell: ({ model }) => {
        const r = reasoningCostResult(model);
        return r.ok ? r.text : mutedNote(r.text);
      },
      text: ({ model }) => reasoningCostResult(model).text
    };
    const totalCostRow: CompareRow = {
      key: "total_cost",
      label: "예상 합계",
      cell: ({ model }) => {
        const r = totalCostResult(model);
        return r.ok ? r.text : mutedNote(r.text);
      },
      text: ({ model }) => totalCostResult(model).text
    };
    const mediumDiffRow: CompareRow = {
      key: "medium_diff",
      label: "Medium 대비 차이",
      cell: ({ model }) => {
        const r = mediumDiffResult(model);
        return r.ok ? r.text : mutedNote(r.text);
      },
      text: ({ model }) => mediumDiffResult(model).text
    };

    const insertAt = BASE_COMPARE_ROWS.findIndex((row) => row.key === "minimum_access");
    const rows = [...BASE_COMPARE_ROWS];
    rows.splice(
      insertAt === -1 ? rows.length : insertAt,
      0,
      effortRow,
      mediumReasoningTokensRow,
      reasoningTokensRow,
      appliedRatesRow,
      baseCostRow,
      reasoningCostRow,
      totalCostRow,
      mediumDiffRow
    );
    return rows;
  }, [effortByModelId, reasoningTokensByKey, sharedTokenStatus, normalInputRaw, cacheReadRaw, displayOutputRaw]);

  const modelsById = useMemo(() => {
    const map = new Map<string, ModelEntry>();
    for (const group of modelGroups) {
      const agent = agents.find((a) => a.slug === group.agent_slug);
      if (!agent) continue;
      for (const model of group.models.slice(0, MAX_LISTED)) {
        map.set(model.id, { model, agent, input_modalities: model.input_modalities ?? group.input_modalities });
      }
    }
    return map;
  }, [agents, modelGroups]);

  const selectedModels = selectedIds
    .map((id) => modelsById.get(id))
    .filter((entry): entry is ModelEntry => Boolean(entry));

  const visibleRows = compareRows.filter((row) => !hiddenRowKeys.includes(row.key));

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

  function tokenAssumptionText(): string {
    const describe = (parsed: ParsedTokenCount) =>
      parsed.status === "ok" ? String(parsed.value) : parsed.status === "invalid" ? "입력값 오류" : "미입력";
    const longNote = longContextExceeded ? " · 272K 초과로 비용 미계산" : "";
    return `공통 토큰 가정 - 일반 입력: ${describe(normalInput)}, 캐시 읽기: ${describe(cacheReadInput)}, 화면 출력: ${describe(displayOutputInput)}${longNote}`;
  }

  function buildMarkdown(): string {
    const escapeMarkdown = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const header = ["항목", ...selectedModels.map(({ model, agent }) => `${agent.title} · ${model.name}`)];
    const separator = header.map(() => "---");
    const rows = visibleRows.map((row) => [row.label, ...selectedModels.map((entry) => row.text(entry))]);
    const lines = [header, separator, ...rows].map((cols) => `| ${cols.map(escapeMarkdown).join(" | ")} |`);
    return [tokenAssumptionText(), "", ...lines].join("\n");
  }

  function buildCsv(): string {
    const header = ["항목", ...selectedModels.map(({ model, agent }) => `${agent.title} · ${model.name}`)];
    const rows = visibleRows.map((row) => [row.label, ...selectedModels.map((entry) => row.text(entry))]);
    const assumptionLine = escapeCsvCell(tokenAssumptionText());
    return [assumptionLine, "", header, ...rows]
      .map((cols) => (Array.isArray(cols) ? cols.map(escapeCsvCell).join(",") : cols))
      .join("\r\n");
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
        <h3 style={{ margin: "0 0 10px" }}>Effort별 예상 비용 계산 (선택 모델 공통)</h3>
        <p className="section-note" style={{ marginBottom: "8px" }}>
          아래 3개 값은 선택한 모든 모델에 동일하게 적용됩니다. API 표준 요금·짧은 컨텍스트(≤{LONG_CONTEXT_TOKEN_LIMIT.toLocaleString("ko-KR")} 토큰)·텍스트 기준이며,
          캐시 쓰기·도구 호출·속도/지역 프리미엄·구독 크레딧은 계산에서 제외됩니다.
        </p>
        <div className="model-picker-grid" style={{ marginBottom: "8px" }}>
          <label className="model-picker-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
            <span>일반 입력 토큰 (캐시 읽기 제외)</span>
            <input
              type="text"
              inputMode="numeric"
              className="filter-select"
              style={{ width: "100%" }}
              value={normalInputRaw}
              placeholder="예: 5000"
              aria-label="일반 입력 토큰 수"
              onChange={(e) => { setCopyStatus("idle"); setNormalInputRaw(e.target.value); }}
            />
          </label>
          <label className="model-picker-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
            <span>캐시 읽기 토큰</span>
            <input
              type="text"
              inputMode="numeric"
              className="filter-select"
              style={{ width: "100%" }}
              value={cacheReadRaw}
              placeholder="예: 20000"
              aria-label="캐시 읽기 토큰 수"
              onChange={(e) => { setCopyStatus("idle"); setCacheReadRaw(e.target.value); }}
            />
          </label>
          <label className="model-picker-item" style={{ flexDirection: "column", alignItems: "flex-start", gap: "4px" }}>
            <span>출력 토큰 (추론 제외, output_tokens − reasoning_tokens)</span>
            <input
              type="text"
              inputMode="numeric"
              className="filter-select"
              style={{ width: "100%" }}
              value={displayOutputRaw}
              placeholder="예: 800"
              aria-label="출력 토큰 수 (추론 제외)"
              onChange={(e) => { setCopyStatus("idle"); setDisplayOutputRaw(e.target.value); }}
            />
          </label>
        </div>
        <p className="section-note" style={{ marginBottom: "8px" }}>
          이 값은 화면에 보이는 답변 글자를 센 값이 아니라, API 사용량의 <code>output_tokens - reasoning_tokens</code>에 해당합니다.
          형식·도구 호출 등 눈에 보이지 않는 출력 토큰이 있을 수 있어, 화면에서 센 글자 수만 입력하면 실제 청구액과 다를 수 있습니다.
        </p>
        <div aria-live="polite" className="filter-count" style={{ marginBottom: "8px" }}>
          {sharedTokenStatus === "invalid" && "입력값 오류: 0 이상의 정수만 입력할 수 있습니다."}
          {sharedTokenStatus === "long_context" &&
            `일반 입력+캐시 읽기 합이 ${LONG_CONTEXT_TOKEN_LIMIT.toLocaleString("ko-KR")} 토큰을 넘었습니다. 장문 컨텍스트 할증은 지원하지 않아 금액을 계산하지 않습니다.`}
          {sharedTokenStatus === "incomplete" && "3개 값을 모두 입력하면 예상 비용이 표시됩니다."}
        </div>

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
            <p className="section-note" style={{ marginBottom: "8px" }}>
              추론 강도(effort)를 올려도 표에 적힌 100만 토큰당 단가는 그대로입니다. 다만 실제로 쓰이는 추론 토큰량·응답 시간·작업당 비용은 달라질 수 있습니다.
              OpenAI/Codex 모델에만 적용되며 값 범위는{" "}
              <a href={REASONING_GUIDE_URL} target="_blank" rel="noopener noreferrer">공식 추론 가이드 ↗</a>
              를 따릅니다.
            </p>
            <p className="section-note" style={{ marginBottom: "8px" }}>
              추론 토큰은 고정 배수가 없어 자동으로 채울 수 없습니다. OpenAI/Codex 모델은 API 응답의{" "}
              <code>output_tokens_details.reasoning_tokens</code> 실측값(또는 가정값)을 직접 입력해 주세요. effort가 none이면 0을 입력하면 됩니다.
              <strong> 실측값이 없으면 정확한 비용 비교는 불가능합니다.</strong> 다른 제공사 모델은 effort 개념이 달라 추론 추가 비용을 계산하지 않습니다.
            </p>
            <p className="section-note" style={{ marginBottom: "8px" }}>
              Medium 대비 비교는 기준 추론 토큰과 선택 effort 추론 토큰을 각각 입력해야 합니다.
            </p>

            <details className="model-picker-fieldset" style={{ marginBottom: "12px" }}>
              <summary className="model-picker-legend">표시할 비교 항목</summary>
              <div className="model-picker-list">
                {compareRows.map((row) => (
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
