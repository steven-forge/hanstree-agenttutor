"use client";

import { useEffect, useRef, useState } from "react";
import type { Edition } from "../../lib/card-news/types";

type ProgressResponse = { edition: Edition | null; checkedAt: string; remoteStatus?: string; remoteCheckedAt?: string; statusError?: string; error?: string };
type Props = { edition: Edition; pending: string; uncertain: boolean; sessionExpired: boolean; onEdition: (edition: Edition) => void; onExpired: () => void; onContinue: () => void };
const STEPS = ["카드 준비", "게시물 구성", "이미지 처리", "최종 발행"];
function time(value?: string) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date(value)) : "기록 없음";
}
function elapsed(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}분 ${seconds % 60}초` : `${seconds}초`;
}
export function publicationSummary(edition: Edition) {
  const p = edition.publication;
  if (edition.status === "published") return "Instagram 발행 완료";
  if (p?.publishRequestedAt) return "최종 발행 응답 확인 중";
  if (p?.containerId) return "Instagram 이미지 처리 단계";
  if (p?.children.length === 10) return "카드 10장 준비 요청 완료 · 게시물 구성 단계";
  return p ? `카드 준비 요청 ${p.children.length}/10장` : "발행 요청 확인 중";
}

export default function PublicationProgress(props: Props) {
  const { edition, pending, uncertain, sessionExpired, onContinue } = props;
  const callbacks = useRef(props);
  callbacks.current = props;
  const [remote, setRemote] = useState<{ key: string; status: string; checkedAt: string } | null>(null);
  const [checkedAt, setCheckedAt] = useState("");
  const [queryError, setQueryError] = useState("");
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);
  // Use the same initial value on the server and browser; poll() reads the live clock after hydration.
  const [clock, setClock] = useState(() => Date.parse(edition.updatedAt));
  const remotePoll = useRef<{ key: string; last: number; count: number; status?: string }>({ key: "", last: 0, count: 0 });
  const active = !sessionExpired && (uncertain || pending === "publish" || pending === "reconcile" || ["publishing", "needs_check"].includes(edition.status));
  const starting = pending === "publish" && edition.status === "approved";
  const publication = starting ? undefined : edition.publication;
  const remoteKey = `${publication?.attempt || ""}:${publication?.containerId || ""}:${publication?.publishRequestedAt || ""}`;
  const remoteStatus = remote?.key === remoteKey ? remote.status : undefined;

  useEffect(() => {
    if (pending === "publish") document.getElementById("cn-publication-progress")?.scrollIntoView({ block: "nearest" });
  }, [pending]);

  useEffect(() => {
    if (!active) return;
    let disposed = false, fetching = false;
    const controller = new AbortController();
    async function poll() {
      setClock(Date.now());
      if (disposed || fetching || document.visibilityState === "hidden") return;
      const current = callbacks.current;
      if (current.pending && !["publish", "reconcile"].includes(current.pending)) return;
      const p = current.edition.publication;
      const key = `${p?.attempt || ""}:${p?.containerId || ""}:${p?.publishRequestedAt || ""}`;
      if (remotePoll.current.key !== key) remotePoll.current = { key, last: 0, count: 0 };
      const timing = remotePoll.current;
      const queryRemote = !!p?.containerId && timing.status !== "PUBLISHED" && Date.now() - Date.parse(current.edition.updatedAt) >= 60000 && timing.count < 5 && Date.now() - timing.last >= 60000;
      if (queryRemote) { timing.last = Date.now(); timing.count++; }
      fetching = true; setChecking(true);
      try {
        const response = await fetch(`/api/admin/news/progress?${new URLSearchParams({ date: current.edition.date, ...(queryRemote ? { remote: "1" } : {}) })}`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(65000)]) });
        const result: ProgressResponse = await response.json().catch(() => { throw new Error("진행 상태 응답을 읽지 못했습니다. 잠시 후 다시 확인합니다."); });
        if (disposed) return;
        if (response.status === 401) { current.onExpired(); throw new Error("로그인이 만료되어 자동 확인을 멈췄습니다. 다시 로그인해 주세요."); }
        if (!response.ok || result.error) throw new Error(result.error || "진행 상태를 가져오지 못했습니다. 잠시 후 다시 확인합니다.");
        if (!result.edition || result.edition.date !== current.edition.date) throw new Error("아직 발행 기록을 확인하지 못했습니다. 기존 화면을 유지하고 다시 확인합니다.");
        if (result.edition.date !== callbacks.current.edition.date || result.edition.revision < callbacks.current.edition.revision) return;
        // This query only reads progress. It never continues or retries a publication.
        callbacks.current.onEdition(result.edition);
        setCheckedAt(result.checkedAt); setQueryError(result.statusError || "");
        if (result.remoteStatus) {
          const latest = result.edition.publication;
          remotePoll.current.status = result.remoteStatus;
          setRemote({ key: `${latest?.attempt || ""}:${latest?.containerId || ""}:${latest?.publishRequestedAt || ""}`, status: result.remoteStatus, checkedAt: result.remoteCheckedAt || result.checkedAt });
        }
      } catch (caught) {
        if (!disposed) setQueryError(caught instanceof Error && caught.name !== "TimeoutError" ? caught.message : "진행 상태 조회가 늦어지고 있습니다. 기존 기록을 유지하고 다시 확인합니다.");
      } finally { fetching = false; if (!disposed) setChecking(false); }
    }
    void poll();
    const timer = window.setInterval(poll, 10000);
    document.addEventListener("visibilitychange", poll);
    return () => { disposed = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", poll); };
  }, [active, edition.date, refresh]);

  const done = edition.status === "published" || remoteStatus === "PUBLISHED";
  const failed = remoteStatus === "ERROR" || remoteStatus === "EXPIRED";
  const ready = remoteStatus === "FINISHED" && !publication?.publishRequestedAt;
  const stage = done ? 4 : publication?.publishRequestedAt || ready ? 3 : publication?.containerId ? 2 : publication?.children.length === 10 ? 1 : 0;
  const count = Math.min(10, publication?.children.length || 0);
  const age = Math.max(0, clock - Date.parse(edition.updatedAt));
  const wait = Math.max(0, (publication?.containerId ? 60000 : 600000) - age);
  const recoverable = ["publishing", "needs_check"].includes(edition.status);
  const title = done ? "Instagram 발행 완료" : ready ? "이미지 처리 완료 · 발행을 이어갈 수 있습니다" : failed ? remoteStatus === "EXPIRED" ? "이미지 준비가 만료되었습니다" : "Instagram 이미지 처리 실패" : starting ? "발행 요청을 시작하고 있습니다" : publicationSummary(edition);
  const paused = remotePoll.current.key === remoteKey && remotePoll.current.count >= 5;

  return <section id="cn-publication-progress" className="cn-publication-progress" aria-labelledby="cn-progress-heading">
    <div className="cn-section-head"><h2 id="cn-progress-heading">Instagram 발행 진행</h2><span className={`cn-tag ${done ? "cn-tag-ok" : failed || edition.status === "needs_check" ? "cn-tag-warn" : "cn-tag-info"}`}>{done ? "완료 확인" : active && checking ? "상태 확인 중" : "진행 기록"}</span></div>
    <p className="cn-progress-title" role="status" aria-live="polite">{title}</p>
    <ol className="cn-progress-steps">{STEPS.map((label, index) => <li key={label} className={index < stage ? "is-done" : index === stage ? "is-current" : ""} aria-current={index === stage ? "step" : undefined}><span>{index < stage ? "✓" : index + 1}</span>{label}</li>)}</ol>
    <label className="cn-progress-count">카드 준비 요청 <strong>{count}/10장</strong><progress max={10} value={count} aria-label={`카드 준비 요청 ${count}/10장`} /></label>
    {publication?.message && <p className="cn-progress-detail">최근 처리 기록: {publication.message}</p>}
    <div className="cn-progress-times"><span>발행 시작 {time(publication?.startedAt)}{publication?.startedAt && !done && ` · ${elapsed(clock - Date.parse(publication.startedAt))} 경과`}</span><span>마지막 처리 {time(edition.updatedAt)} KST</span><span>상태 조회 {checkedAt ? `${time(checkedAt)} KST` : active ? "확인 중" : "저장된 기록"}</span>{edition.publishedAt && <span>발행 완료 기록 {time(edition.publishedAt)} KST</span>}{remote?.key === remoteKey && <span>Instagram 확인 {time(remote.checkedAt)} KST</span>}</div>
    {queryError && <p className="cn-alert" role="alert">{queryError}</p>}
    {!done && active && age >= 120000 && <p className="cn-help">{elapsed(age)} 동안 새 처리 기록이 없습니다. 발행 성공·실패가 확정된 것은 아닙니다. 아래 안내에 따라 확인해 주세요.</p>}
    {recoverable && <p className="cn-help">{remoteStatus === "PUBLISHED" ? "Instagram에서 게시 완료를 확인했습니다. ‘완료 기록 확인’을 눌러 판본에도 완료 상태를 저장하세요." : publication?.publishRequestedAt ? "최종 발행 요청을 이미 보냈습니다. 결과 확인만 진행하며 같은 게시물을 다시 발행하지 않습니다." : ready ? "‘발행 계속 및 확인’을 누르면 처음 요청한 게시물의 최종 발행을 진행합니다." : !publication?.containerId ? "카드 준비 중 요청이 끊겼다면 마지막 처리 후 10분이 지나야 복구할 수 있습니다." : failed ? "‘발행 계속 및 확인’에서 준비 실패·만료를 확인하고 검토 완료 상태로 돌아갈 수 있습니다." : "이미지 처리가 끝나면 ‘발행 계속 및 확인’으로 처음 요청한 발행을 마무리할 수 있습니다."}</p>}
    <div className="cn-publish-actions">
      {recoverable && <button type="button" className="cn-button cn-button-primary" onClick={onContinue} disabled={!!pending || sessionExpired || wait > 0}>{remoteStatus === "PUBLISHED" ? "완료 기록 확인" : "발행 계속 및 확인"}</button>}
      {active && <button type="button" className="cn-button" onClick={() => { remotePoll.current.count = 0; setRefresh(value => value + 1); }} disabled={checking}>진행 상태 새로 확인</button>}
      {recoverable && wait > 0 && <span className="cn-help">{elapsed(wait)} 후 발행 계속·확인 가능</span>}
    </div>
    {active && <p className="cn-help">진행 기록은 10초마다 자동 확인합니다. Instagram 처리 상태는 1분 간격으로 최대 5회 조회합니다.{paused ? " 자동 원격 조회를 마쳤습니다. 필요하면 진행 상태를 새로 확인하세요." : ""}</p>}
    {edition.status === "published" && publication?.permalink && /^https:\/\/(www\.)?instagram\.com\//.test(publication.permalink) && <a className="cn-text-link" href={publication.permalink} target="_blank" rel="noopener noreferrer">Instagram 게시물 보기</a>}
  </section>;
}
