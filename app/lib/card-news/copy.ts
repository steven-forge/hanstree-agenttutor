export type CardCopy = { title: string; body: string };
export const CARD_TEXT = { title: { lines: 2, width: 16 }, body: { lines: 6, width: 18 } } as const;
export const hasEllipsis = (text: string) => /[\u2026\u22ef]|\.(?:\s*\.){2,}/.test(text);
export const lineWidth = (text: string) => Array.from(text).reduce((n, c) => n + (/[^\u0000-\u007f]/.test(c) || /[MW@%]/.test(c) ? 1 : .65), 0);

// Wrap complete copy at word boundaries; never discard text or append an ellipsis.
export function wrapCardText(text: string, width: number): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    if (line && lineWidth(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
    if (line) { lines.push(line); line = ""; }
    for (const character of Array.from(word)) {
      if (line && lineWidth(line + character) > width) { lines.push(line); line = ""; }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
export function copyIssues(copy: CardCopy): string[] {
  const issues: string[] = [];
  for (const key of ["title", "body"] as const) {
    const label = key === "title" ? "제목" : "본문", rule = CARD_TEXT[key], lines = copy[key].split("\n");
    if (!copy[key].trim() || lines.length > rule.lines) issues.push(`${label}은 1~${rule.lines}줄로 작성하세요.`);
    if (lines.some(line => lineWidth(line) > rule.width)) issues.push(`${label} 한 줄이 너무 깁니다. 내용을 간결하게 정리해 주세요.`);
    if (hasEllipsis(copy[key])) issues.push(`${label}에 말줄임표를 사용할 수 없습니다. 완결된 문장으로 정리하세요.`);
  }
  return issues;
}
export function fitCardCopy(copy: CardCopy): CardCopy | null {
  const result = { title: wrapCardText(copy.title, CARD_TEXT.title.width), body: wrapCardText(copy.body, CARD_TEXT.body.width) };
  return copyIssues(result).length ? null : result;
}
