export type AutomationSettings = {
  revision: number; enabled: boolean; prepareTime: string; publishTime: string;
  maxAgeHours: number; accountId?: string; updatedAt?: string;
};
export type AutomationRun = {
  date: string; phase: "idle" | "preparing" | "ready" | "waiting" | "publishing" | "published" | "failed" | "preserved";
  message: string; updatedAt: string; lastTickAt?: string; lastSuccessAt?: string;
  nextAttemptAt?: string; candidates?: number; cards?: number; attempts?: number; testRequested?: boolean; settingsRevision?: number;
};
export type AutomationView = {
  settings: AutomationSettings; run: AutomationRun | null; schedulerConfigured: boolean;
  nextPrepareAt: string; nextPublishAt: string; checkedAt: string;
  // Stored edition result only; the raw run above is never rewritten from it.
  completedEdition?: { date: string; publishedAt?: string; updatedAt: string; cards: number };
};
export const AUTOMATION_DEFAULTS: AutomationSettings = { revision: 0, enabled: false, prepareTime: "08:05", publishTime: "09:00", maxAgeHours: 168 };
export function validateAutomationSettings(value: unknown): AutomationSettings {
  if (!value || typeof value !== "object") throw new Error("예약 설정을 확인하세요.");
  const v = value as Record<string, unknown>;
  const time = (key: string) => {
    if (typeof v[key] !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v[key])) throw new Error("제작·발행 시각을 한국 시간으로 입력하세요.");
    return v[key] as string;
  };
  const prepareTime = time("prepareTime"), publishTime = time("publishTime");
  if (prepareTime >= publishTime) throw new Error("발행 시각은 같은 날의 제작 시각보다 늦어야 합니다.");
  if (typeof v.enabled !== "boolean" || !Number.isSafeInteger(v.revision) || Number(v.revision) < 0 || Number(v.revision) >= Number.MAX_SAFE_INTEGER || ![72, 168, 336, 720].includes(Number(v.maxAgeHours)) || typeof v.maxAgeHours !== "number") throw new Error("예약 사용 여부·선정 기간·설정 버전을 확인하세요.");
  return { revision: v.revision as number, enabled: v.enabled, prepareTime, publishTime, maxAgeHours: v.maxAgeHours };
}
export function scheduledAt(date: string, time: string) { return new Date(`${date}T${time}:00+09:00`).toISOString(); }
export function nextScheduledAt(time: string, now = new Date()) {
  const day = new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const today = scheduledAt(day, time);
  return Date.parse(today) > now.getTime() ? today : new Date(Date.parse(today) + 86400000).toISOString();
}
