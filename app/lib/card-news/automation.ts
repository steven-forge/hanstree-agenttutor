import "server-only";
import { randomUUID } from "node:crypto";
import { todayData } from "../../content";
import { AdminError, getEdition, prefix, putEdition, redis, setupStatus } from "./server";
import { collectEdition } from "./collect";
import { captionFor, editionIssues, kstDate, type Edition } from "./types";
import { renderCard } from "./render";
import { AutoCopyError, selectAutomaticCards } from "./auto-copy";
import { instagramAccount, latestInstagramPublication, PublishCooldown, publishEdition, reconcileEdition } from "./instagram";
import { AUTOMATION_DEFAULTS, nextScheduledAt, scheduledAt, validateAutomationSettings, type AutomationRun, type AutomationSettings, type AutomationView } from "./automation-policy";

const settingsKey = `${prefix}automation-settings`, runKey = `${prefix}automation-run`, lockKey = `${prefix}automation-lock`, testKey = `${prefix}automation-test`;
type TestRequest = { id: string; date: string; accountId: string; settingsRevision: number };
const stamp = () => new Date().toISOString();
export async function automationSettings(): Promise<AutomationSettings> {
  const raw = await redis<string | null>("GET", settingsKey);
  if (!raw) return { ...AUTOMATION_DEFAULTS };
  const parsed = JSON.parse(raw);
  return { ...validateAutomationSettings(parsed), accountId: typeof parsed.accountId === "string" && /^\d+$/.test(parsed.accountId) ? parsed.accountId : undefined, updatedAt: parsed.updatedAt };
}
async function readRun(): Promise<AutomationRun | null> {
  const raw = await redis<string | null>("GET", runKey);
  return raw ? JSON.parse(raw) : null;
}
async function writeRun(run: AutomationRun, patch: Partial<AutomationRun>) {
  const next = { ...run, ...patch, updatedAt: stamp() };
  await redis("SET", runKey, JSON.stringify(next));
  return next;
}
export async function automationView(): Promise<AutomationView> {
  const settings = await automationSettings();
  return { settings, run: await readRun(), schedulerConfigured: setupStatus().scheduler, nextPrepareAt: nextScheduledAt(settings.prepareTime), nextPublishAt: nextScheduledAt(settings.publishTime) };
}
export async function saveAutomationSettings(input: unknown) {
  let settings: AutomationSettings;
  try { settings = validateAutomationSettings(input); } catch (e) { throw new AdminError(e instanceof Error ? e.message : "설정을 확인하세요."); }
  // Pin the actual account, never an account ID supplied by a browser.
  const accountId = settings.enabled ? (await instagramAccount()).id : undefined;
  const current = await automationSettings();
  if (current.revision !== settings.revision) throw new AdminError("다른 창에서 예약 설정이 변경됐습니다. 새로 불러와 주세요.", 409);
  const next = { ...settings, revision: settings.revision + 1, accountId, updatedAt: stamp() };
  const result = await redis<number>("EVAL", "local v=redis.call('GET',KEYS[1]); local rev=0; if v then rev=cjson.decode(v).revision end; if rev~=tonumber(ARGV[1]) then return 0 end; redis.call('SET',KEYS[1],ARGV[2]); return 1", 1, settingsKey, current.revision, JSON.stringify(next));
  if (result !== 1) throw new AdminError("예약 설정이 변경됐습니다. 다시 불러와 주세요.", 409);
  return automationView();
}
async function historyEditions(): Promise<Edition[]> {
  const dates = await redis<string[]>("ZREVRANGE", `${prefix}history`, 0, 59);
  if (!dates.length) return [];
  const raw = await redis<(string | null)[]>("MGET", ...dates.map(date => `${prefix}edition:${date}`));
  return raw.filter((item): item is string => !!item).map(item => JSON.parse(item));
}
async function prepareEdition(date: string, settings: AutomationSettings) {
  const old = await getEdition(date);
  if (old?.status === "published" || old?.status === "publishing" || old?.status === "needs_check") return old;
  if (old && !old.automation && (old.cards.length || old.caption !== captionFor([]))) {
    throw new AdminError("관리자가 작성한 원고를 보존했습니다. 자동 제작은 카드가 없는 판본에서 실행하세요.", 409);
  }
  if (old?.automation && !editionIssues(old).length && old.cards.every(card => Date.parse(card.publishedAt) >= Date.now() - settings.maxAgeHours * 3600000)) return old;
  const collectedAt = Date.parse(todayData.collected_at || "");
  if (!Number.isFinite(collectedAt) || Date.now() - collectedAt > 24 * 3600000 || collectedAt > Date.now() + 60000) throw new AdminError("최근 24시간 안에 수집한 뉴스레터 데이터가 없습니다. 뉴스 수집과 운영 반영 상태를 확인하세요.", 503);
  const edition = await collectEdition(date, old?.automation ? { ...old, status: "draft", cards: [], caption: captionFor([]) } : old);
  const history = await historyEditions();
  const uncertain = history.find(item => item.date !== date && ["publishing", "needs_check"].includes(item.status) && item.publication?.publishRequestedAt);
  if (uncertain) throw new AdminError(`${uncertain.date} 판본의 이전 발행 결과가 아직 확정되지 않았습니다. 해당 판본에서 발행 결과를 확인한 뒤 다시 제작하세요.`, 409);
  const previousUrls = history.filter(item => item.status === "published").flatMap(item => item.cards.map(card => card.sourceUrl));
  const selected = selectAutomaticCards(edition.candidates, previousUrls, new Date(), settings.maxAgeHours as 72 | 168 | 336 | 720);
  const cards = selected.cards.map(card => ({ ...card, verification: "automatic" as const }));
  const prepared: Edition = { ...edition, cards, caption: captionFor(cards), status: "approved", approvedAt: stamp(), automation: { preparedAt: stamp(), settingsRevision: settings.revision, accountId: settings.accountId, candidateCount: selected.eligibleCount } };
  const issues = editionIssues(prepared);
  if (issues.length) throw new AdminError(issues[0]);
  // Render all ten actual JPGs before marking automatic preparation complete.
  for (const card of cards) await renderCard(card);
  return putEdition(prepared, old?.revision || 0);
}

export async function cancelAutomationTest() {
  await redis("DEL", testKey);
  const run = await readRun();
  if (run?.testRequested) await writeRun(run, { phase: run.phase === "publishing" ? "publishing" : "idle", testRequested: false, nextAttemptAt: undefined, message: "발행 테스트 대기를 취소했습니다. 이미 전송된 발행 요청은 취소할 수 없습니다." });
  return automationView();
}

// One short runner shared by the scheduler and the administrator; no browser must stay open.
export async function runAutomation(mode: "tick" | "prepare" | "test" = "tick") {
  const owner = randomUUID();
  if (await redis("SET", lockKey, owner, "NX", "EX", 360) !== "OK") return automationView();
  let run: AutomationRun | null = null;
  try {
    const settings = await automationSettings(), now = new Date();
    const previous = await readRun();
    if (mode === "test") {
      const account = await instagramAccount();
      const ticket: TestRequest = { id: randomUUID(), date: kstDate(now), accountId: account.id, settingsRevision: settings.revision };
      await redis("SET", testKey, JSON.stringify(ticket), "EX", 24 * 3600);
    }
    const rawTicket = await redis<string | null>("GET", testKey);
    const ticket: TestRequest | null = rawTicket ? JSON.parse(rawTicket) : null;
    const continuingTest = !!ticket;
    const date = ticket?.date || kstDate(now);
    run = previous?.date === date ? previous : { date, phase: "idle", message: "오늘 예약을 기다리고 있습니다.", updatedAt: stamp() };
    run = await writeRun(run, { ...(mode === "tick" ? { lastTickAt: stamp() } : {}), testRequested: !!ticket, settingsRevision: settings.revision, ...(mode === "test" || mode === "prepare" || run.settingsRevision !== settings.revision ? { attempts: 0, nextAttemptAt: undefined } : {}) });
    const testing = mode === "test" || !!continuingTest;
    if (mode === "tick" && !testing && !settings.enabled) return automationView();
    const prepareAt = Date.parse(scheduledAt(date, settings.prepareTime)), publishAt = Date.parse(scheduledAt(date, settings.publishTime));
    if (mode === "tick" && !testing && now.getTime() < prepareAt) return automationView();
    if (mode === "tick" && !testing && now.getTime() > publishAt + 2 * 3600000) {
      if (!["published", "failed"].includes(run.phase)) await writeRun(run, { phase: "failed", message: "예약 시각에서 2시간이 지나 오늘 자동 발행을 종료했습니다. 직접 확인 후 발행 테스트를 실행할 수 있습니다." });
      return automationView();
    }
    if (mode === "tick" && (run.attempts || 0) >= 5) {
      await writeRun(run, { phase: "failed", message: "자동 재시도 5회가 끝났습니다. 발행 결과와 연결 상태를 확인한 뒤 직접 다시 실행하세요.", testRequested: false });
      if (rawTicket) await redis("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, testKey, rawTicket);
      return automationView();
    }
    if (mode === "tick" && run.nextAttemptAt && Date.parse(run.nextAttemptAt) > Date.now()) return automationView();
    let edition = await getEdition(date);
    if (edition?.status === "published") {
      await writeRun(run, { phase: "published", cards: edition.cards.length, message: "이 판본은 이미 발행됐습니다. 중복 게시하지 않았습니다.", testRequested: false, nextAttemptAt: undefined });
      if (rawTicket) await redis("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, testKey, rawTicket);
      return automationView();
    }
    // Existing human-approved cards may be used only by an explicit administrator test.
    if (!(testing && edition?.status === "approved" && !editionIssues(edition).length) && !["publishing", "needs_check"].includes(edition?.status || "")) {
      run = await writeRun(run, { phase: "preparing", message: "뉴스를 선정하고 카드 10장의 JPG를 확인하고 있습니다." });
      edition = await prepareEdition(date, settings);
    }
    if (!edition) throw new AdminError("제작할 판본이 없습니다.");
    if (mode === "prepare") {
      const inProgress = ["publishing", "needs_check"].includes(edition.status);
      await writeRun(run, { phase: inProgress ? "waiting" : "ready", cards: edition.cards.length, candidates: edition.automation?.candidateCount, message: inProgress ? "기존 발행이 진행 중입니다. 판본을 보존했으며 발행 진행 상태를 확인해 주세요." : "카드 10장과 게시글 설명을 준비했습니다. 이 버튼은 Instagram에 게시하지 않습니다.", lastSuccessAt: inProgress ? run.lastSuccessAt : stamp(), nextAttemptAt: undefined });
      return automationView();
    }
    if (!testing && !edition.automation) {
      await writeRun(run, { phase: "preserved", message: "관리자가 작성한 판본을 보존했습니다. 자동 발행하지 않습니다." });
      return automationView();
    }
    if (!testing && now.getTime() < publishAt) {
      await writeRun(run, { phase: "ready", cards: edition.cards.length, candidates: edition.automation?.candidateCount, message: `${settings.publishTime} KST 자동 발행을 기다리고 있습니다.`, lastSuccessAt: stamp(), nextAttemptAt: scheduledAt(date, settings.publishTime) });
      return automationView();
    }
    const recent = await latestInstagramPublication();
    const accountId = testing ? ticket?.accountId : settings.accountId;
    if (!accountId || accountId !== recent.accountId) throw new AdminError("예약한 Instagram 계정과 현재 연결 계정이 다릅니다. 예약 설정을 다시 저장하세요.", 409);
    const assertPermission = async () => {
      const current = await automationSettings();
      if (current.revision !== settings.revision || (testing ? ticket?.settingsRevision !== current.revision || await redis("GET", testKey) !== rawTicket : !current.enabled || current.accountId !== accountId)) throw new AdminError("예약 설정이 변경되거나 발행 테스트가 취소되어 발행을 중단했습니다.", 409);
      if (edition!.automation && edition!.cards.some(card => Date.parse(card.publishedAt) < Date.now() - current.maxAgeHours * 3600000)) throw new AdminError("제작한 카드가 현재 뉴스 선정 기간을 벗어났습니다. 원고를 확인해 다시 제작하세요.", 409);
    };
    // A pending final request must be reconciled even during cooldown, never sent twice.
    if (!edition.publication?.publishRequestedAt && Date.parse(recent.nextAllowedAt) > Date.now()) throw new PublishCooldown(recent.nextAllowedAt);
    run = await writeRun(run, { phase: "publishing", message: "Instagram 발행과 처리 결과를 확인하고 있습니다.", cards: edition.cards.length, candidates: edition.automation?.candidateCount, nextAttemptAt: undefined });
    await assertPermission();
    const result = edition.status === "approved"
      ? await publishEdition(edition, accountId, { beforePublish: assertPermission })
      : await reconcileEdition(edition, { beforePublish: assertPermission });
    const finished = result.status === "published";
    await writeRun(run, { phase: finished ? "published" : "waiting", message: result.publication?.message || "다음 예약 점검에서 발행 결과를 확인합니다.", lastSuccessAt: finished ? stamp() : run.lastSuccessAt, nextAttemptAt: finished ? undefined : new Date(Date.now() + 60000).toISOString(), testRequested: finished ? false : testing, attempts: finished ? 0 : (run.attempts || 0) + 1 });
    if (finished && rawTicket) await redis("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, testKey, rawTicket);
  } catch (error) {
    if (run) {
      const cooldown = error instanceof PublishCooldown;
      const preserved = error instanceof AdminError && error.message.startsWith("관리자가 작성한 원고");
      await writeRun(run, { phase: cooldown ? "waiting" : preserved ? "preserved" : "failed", message: error instanceof AdminError || error instanceof AutoCopyError ? error.message : "자동 제작·발행을 완료하지 못했습니다. 저장소와 연결 상태를 확인하세요.", nextAttemptAt: cooldown ? error.nextAllowedAt : new Date(Date.now() + 5 * 60000).toISOString(), attempts: cooldown ? run.attempts : (run.attempts || 0) + 1, ...(error instanceof AutoCopyError ? { cards: error.result.cards.length, candidates: error.result.eligibleCount } : {}) });
    } else throw error;
  } finally {
    await redis("EVAL", "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, lockKey, owner);
  }
  return automationView();
}
