"use client";

import { useMemo, useState } from "react";
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
  sources: Source[];
  price_note: string;
};

type AgentModelGroup = { agent_slug: string; models: AgentModel[] };

const MAX_SELECTED = 5;

function formatUsd(value: number): string {
  return `$${value}`;
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

  const modelsById = useMemo(() => {
    const map = new Map<string, { model: AgentModel; agent: AgentDoc }>();
    for (const group of modelGroups) {
      const agent = agents.find((a) => a.slug === group.agent_slug);
      if (!agent) continue;
      for (const model of group.models) {
        map.set(model.id, { model, agent });
      }
    }
    return map;
  }, [agents, modelGroups]);

  const selectedModels = selectedIds
    .map((id) => modelsById.get(id))
    .filter((entry): entry is { model: AgentModel; agent: AgentDoc } => Boolean(entry));

  const limitReached = selectedIds.length >= MAX_SELECTED;

  function toggleModel(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((v) => v !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  }

  return (
    <div>
      <p className="section-note" style={{ marginBottom: "10px" }}>{unitNote}</p>

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
                {group.models.map((model) => {
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
                        aria-describedby={`model-cost-${model.id}`}
                      />
                      <span>
                        <strong>{model.name}</strong>
                        <span id={`model-cost-${model.id}`} className="model-picker-cost">
                          입력 {formatUsd(model.input_cost)} · 출력 {formatUsd(model.output_cost)} / 1M
                        </span>
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
                <tr>
                  <th scope="row">입력 토큰 비용 (1M당)</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{formatUsd(model.input_cost)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">출력 토큰 비용 (1M당)</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{formatUsd(model.output_cost)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">컨텍스트 크기</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{model.context_window}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">최대 출력</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{model.max_output}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">캐시(읽기) 비용 (1M당)</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{formatUsd(model.cache_read_cost)}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">주요 특징</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>{model.key_feature}</td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">가격 조건</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id} style={{ fontSize: ".82rem", color: "var(--muted)" }}>
                      {model.price_note}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">공식 출처</th>
                  {selectedModels.map(({ model }) => (
                    <td key={model.id}>
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
                    </td>
                  ))}
                </tr>
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
    </div>
  );
}
