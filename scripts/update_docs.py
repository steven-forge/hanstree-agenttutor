#!/usr/bin/env python3
"""AgentTutor 공식 문서 명령어 자동 갱신 스크립트.

Python 표준 라이브러리만 사용해 codex, claude, gemini, agy, grok 5개 대상의
공식 출처를 확인하고 신규/미확인 명령어를 index.html 자동 관리 구역에 반영합니다.
"""

from datetime import datetime, timedelta, timezone
import html
import json
from pathlib import Path
import re
import sys
import urllib.request

REPO_ROOT = Path(__file__).resolve().parent.parent
INDEX_PATH = REPO_ROOT / "index.html"
SOURCES_PATH = REPO_ROOT / "sources.json"
CACHE_DIR = REPO_ROOT / ".source-cache"
SNAPSHOT_PATH = CACHE_DIR / "snapshot.json"

TARGETS = ["codex", "claude", "gemini", "agy", "grok"]
KST = timezone(timedelta(hours=9))


def get_kst_dates():
    now_kst = datetime.now(KST)
    return now_kst.strftime("%Y년 %m월 %d일"), now_kst.strftime("%Y-%m-%d")


def fetch_url(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36 AgentTutor/1.0"
            ),
            "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP status {resp.status} for {url}")
        content_type = resp.headers.get("Content-Type", "")
        charset = "utf-8"
        if "charset=" in content_type.lower():
            charset = content_type.lower().split("charset=")[-1].split(";")[0].strip()
        raw = resp.read()
        return raw.decode(charset, errors="replace")


def extract_raw_snippets(text: str) -> list[str]:
    snippets = []
    # <code>...</code> 태그 내용
    for match in re.findall(r"<code\b[^>]*>([\s\S]*?)</code>", text, re.IGNORECASE):
        cleaned = html.unescape(re.sub(r"<[^>]+>", "", match)).strip()
        if cleaned:
            snippets.append(cleaned)

    # 마크다운 백틱 `...`
    for match in re.findall(r"`([^`\r\n]+)`", text):
        cleaned = html.unescape(match).strip()
        if cleaned:
            snippets.append(cleaned)

    # <pre> 블록 안의 각 줄
    for match in re.findall(r"<pre\b[^>]*>([\s\S]*?)</pre>", text, re.IGNORECASE):
        cleaned = html.unescape(re.sub(r"<[^>]+>", "", match))
        for line in cleaned.splitlines():
            line = line.strip()
            if line:
                snippets.append(line)
    return snippets


def normalize_command(raw: str, target: str) -> tuple[str, str] | None:
    """명령어 텍스트를 정규화하고 (정규화된 명령, 구분) 튜플을 반환합니다."""
    text = html.unescape(raw).strip()
    text = re.sub(r"^[$\s>%#]+\s*", "", text)  # 쉘 프롬프트 제거
    text = re.sub(r"\s+#.*$", "", text)  # 인라인 주석 제거
    text = re.sub(r"\s+", " ", text).strip()

    if not text or len(text) > 100 or len(text) < 2:
        return None

    # URL, 파일 경로, 스크립트 제외
    if any(text.startswith(p) for p in ("http://", "https://", "//", "@")):
        return None
    if re.search(r"\.(?:py|js|ts|json|md|html|css|sh|txt)\b", text):
        return None
    if text.count("/") >= 2:  # 디렉터리 경로 형태 제외
        return None

    # 1. 슬래시 명령: /init, /status 등
    if text.startswith("/"):
        m = re.match(r"^(/[a-zA-Z0-9_-]+)", text)
        if m:
            cmd = m.group(1)
            return cmd, "슬래시 명령"
        return None

    # 2. 타깃 CLI 명령: codex ..., claude ... 등
    target_prefix = target.lower()
    if text.lower() == target_prefix or text.lower().startswith(target_prefix + " "):
        parts = text.split()
        if len(parts) == 1:
            return parts[0].lower(), "CLI 명령"
        # 옵션 플래그 전까지의 서브커맨드 토큰 추출
        subparts = [parts[0].lower()]
        for p in parts[1:]:
            if p.startswith("-") or p.startswith("<") or p.startswith("["):
                break
            subparts.append(p)
        cmd = " ".join(subparts)
        # 괄호나 별칭 설명 제거
        cmd = re.sub(r"\s*\(.*?\)", "", cmd).strip()
        return cmd, "CLI 명령"

    # 3. CLI 옵션/플래그: --sandbox, -p 등
    if text.startswith("--"):
        m = re.match(r"^(--[a-zA-Z0-9_-]+)", text)
        if m:
            return m.group(1), "옵션/플래그"
    elif text.startswith("-") and len(text) <= 3:
        m = re.match(r"^(-[a-zA-Z0-9])", text)
        if m:
            return m.group(1), "옵션/플래그"

    return None


def extract_commands_from_text(text: str, target: str) -> dict[str, str]:
    """텍스트에서 대상 도구의 명령어를 추출해 {command: category} 맵으로 반환합니다."""
    results: dict[str, str] = {}
    snippets = extract_raw_snippets(text)
    for s in snippets:
        # 쉼표나 슬래시로 병기된 항목 분리 (/quit, /exit 또는 -p / --print)
        parts = re.split(r"[\s,]+/[/\s]+|,\s*", s) if ("," in s or " / " in s) else [s]
        for part in parts:
            res = normalize_command(part, target)
            if res:
                cmd, cat = res
                results[cmd] = cat
    return results


def validate_index_html(html_content: str) -> None:
    """HTML 대상 구역이 누락되지 않았는지 검사합니다."""
    for target in TARGETS:
        if f'data-doc="{target}"' not in html_content:
            raise ValueError(f"HTML 대상 구역 누락: data-doc='{target}' article이 없습니다.")

        start_marker = f"<!-- AUTO-MANAGED:{target}:START -->"
        end_marker = f"<!-- AUTO-MANAGED:{target}:END -->"
        if start_marker not in html_content or end_marker not in html_content:
            raise ValueError(f"HTML 대상 구역 누락: {target}의 자동 관리 구역 마커가 없습니다.")

        footer_pattern = rf'<article\b[^>]*\bdata-doc="{target}"[^>]*>[\s\S]*?확인 기준:\s*[0-9]{{4}}-[0-9]{{2}}-[0-9]{{2}}'
        if not re.search(footer_pattern, html_content):
            raise ValueError(f"HTML 대상 구역 누락: {target} article footer의 확인 기준 날짜가 없습니다.")

        if f"id:'{target}'" not in html_content:
            raise ValueError(f"HTML 대상 구역 누락: documents 배열에 id:'{target}' 항목이 없습니다.")


def update_auto_managed_html(html_content: str, target: str, rows: list[dict]) -> str:
    start_marker = f"<!-- AUTO-MANAGED:{target}:START -->"
    end_marker = f"<!-- AUTO-MANAGED:{target}:END -->"

    heading = "h3" if target in ("gemini", "agy") else "h2"

    if rows:
        tr_lines = []
        for r in rows:
            cmd = html.escape(r["command"])
            cat = html.escape(r.get("category", "CLI 명령"))
            status = r.get("status", "new")
            status_text = html.escape(r.get("status_text", "신규 감지"))
            badge_class = "badge-unconfirmed" if status == "unconfirmed" else "badge-new"
            date = html.escape(r.get("date", ""))
            tr_lines.append(
                f"  <tr><td><code>{cmd}</code></td><td>{cat}</td>"
                f'<td><span class="{badge_class}">{status_text}</span></td><td>{date}</td></tr>'
            )
        tbody = "\n" + "\n".join(tr_lines) + "\n  "
    else:
        tbody = '\n  <tr><td colspan="4" class="empty-notice">현재 새로 감지된 명령이나 변동 사항이 없습니다.</td></tr>\n  '

    replacement = (
        f"{start_marker}\n"
        f'  <section class="group auto-managed-group" data-auto-managed="{target}">'
        f"<{heading}>자동 갱신 명령 관리</{heading}>"
        f"<p>공식 문서 자동 감지 결과 추가된 신규 명령 및 상태 변경 목록입니다.</p>\n"
        f'  <div class="table-wrap"><table><thead><tr><th>명령어</th><th>구분</th><th>상태</th><th>확인 날짜</th></tr></thead><tbody>'
        f"{tbody}"
        f"</tbody></table></div></section>\n"
        f"  {end_marker}"
    )

    pattern = rf"{re.escape(start_marker)}[\s\S]*?{re.escape(end_marker)}"
    return re.sub(pattern, replacement, html_content, count=1)


def update_dates(html_content: str, target: str, top_date: str, bottom_date: str) -> str:
    # 1. 상단 갱신 날짜 ({id:'codex', ... updated:'...'})
    top_pattern = rf"(\{{id:'{target}',[^\}}]*?updated:')([^']*)(')"
    html_content = re.sub(top_pattern, rf"\g<1>{top_date}\g<3>", html_content)

    # 2. 하단 확인 기준 날짜 (article <footer> 안의 확인 기준: YYYY-MM-DD)
    def repl(m):
        block = m.group(0)
        return re.sub(
            r"(확인 기준:\s*)[0-9]{4}-[0-9]{2}-[0-9]{2}",
            rf"\g<1>{bottom_date}",
            block,
        )

    article_pattern = rf'<article\b[^>]*\bdata-doc="{target}"[\s\S]*?</article>'
    return re.sub(article_pattern, repl, html_content, count=1)


def load_sources() -> dict:
    if not SOURCES_PATH.exists():
        raise FileNotFoundError(f"{SOURCES_PATH} 파일이 없습니다.")
    with open(SOURCES_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def load_snapshot() -> dict | None:
    if not SNAPSHOT_PATH.exists():
        return None
    try:
        with open(SNAPSHOT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[경고] 기존 스냅샷 읽기 실패: {e}")
        return None


def save_snapshot(data: dict) -> None:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    check_only = "--check" in sys.argv or "--dry-run" in sys.argv
    force_bootstrap = "--bootstrap" in sys.argv

    if not INDEX_PATH.exists():
        print(f"오류: {INDEX_PATH} 파일이 없습니다.", file=sys.stderr)
        sys.exit(1)

    with open(INDEX_PATH, "r", encoding="utf-8") as f:
        html_content = f.read()

    # 9. HTML 대상 구역 검사
    try:
        validate_index_html(html_content)
    except ValueError as e:
        print(f"[검증 실패] {e}", file=sys.stderr)
        sys.exit(1)

    sources_config = load_sources()
    prev_snapshot = load_snapshot()
    is_first_run = (prev_snapshot is None) or force_bootstrap

    fetched_commands: dict[str, dict[str, str]] = {}
    download_errors: dict[str, str] = {}

    top_date_kst, bottom_date_kst = get_kst_dates()

    # 출처 수집
    for target in TARGETS:
        target_info = sources_config.get(target, {})
        source_list = target_info.get("sources", [])
        if not source_list:
            download_errors[target] = "sources.json에 정의된 출처 URL이 없습니다."
            continue

        aggregated_text = ""
        for src in source_list:
            url = src.get("url")
            try:
                content = fetch_url(url)
                if not content or len(content.strip()) < 100:
                    download_errors[target] = f"비정상 빈 결과 (내용 < 100바이트): {url}"
                    break
                aggregated_text += "\n" + content
            except Exception as ex:
                download_errors[target] = f"다운로드 실패 ({url}): {ex}"
                break

        if target in download_errors:
            continue

        cmds = extract_commands_from_text(aggregated_text, target)
        if not cmds:
            download_errors[target] = "비정상 빈 결과: 유효한 명령어가 추출되지 않았습니다."
            continue

        # 기존 스냅샷 대비 과도한 감소 검사 (50% 이상 감소 시 실패)
        if prev_snapshot and target in prev_snapshot.get("targets", {}):
            prev_cmds = prev_snapshot["targets"][target].get("commands", [])
            if prev_cmds and len(cmds) < len(prev_cmds) * 0.5:
                download_errors[target] = (
                    f"기존 대비 과도한 감소 (이전 {len(prev_cmds)}개 -> 현재 {len(cmds)}개)"
                )
                continue

        fetched_commands[target] = cmds

    # 9. 한 출처라도 실패 시 index.html과 snapshot을 변경하지 않고 실패 종료
    if download_errors:
        print("[실패 종료] 출처 수집 또는 검증 중 오류가 발생했습니다:", file=sys.stderr)
        for t, err in download_errors.items():
            print(f"  - {t}: {err}", file=sys.stderr)
        sys.exit(1)

    # 5. 첫 실행은 현재 공식 출처를 기준 snapshot으로 저장하며 문서 본문은 변경하지 않음
    if is_first_run:
        new_snapshot = {
            "version": 1,
            "created_at": bottom_date_kst,
            "last_updated": bottom_date_kst,
            "targets": {},
        }
        for target in TARGETS:
            cmds_dict = fetched_commands[target]
            new_snapshot["targets"][target] = {
                "commands": sorted(list(cmds_dict.keys())),
                "command_categories": cmds_dict,
                "auto_managed": [],
            }

        if check_only:
            print(f"[dry-run] 첫 실행 기준 스냅샷 생성 준비 완료 ({len(TARGETS)}개 대상). 파일 변경 없음.")
            sys.exit(0)

        save_snapshot(new_snapshot)
        print(f"[초기화 완료] 기준 snapshot을 저장했습니다 ({SNAPSHOT_PATH}). 문서 본문은 유지됩니다.")
        sys.exit(0)

    # 이후 실행: 변경 사항 비교
    modified_targets = set()
    updated_snapshot_targets = {}

    for target in TARGETS:
        curr_dict = fetched_commands[target]
        curr_set = set(curr_dict.keys())

        target_snap = prev_snapshot.get("targets", {}).get(target, {})
        prev_cmds = target_snap.get("commands", [])
        prev_set = set(prev_cmds)
        prev_auto = list(target_snap.get("auto_managed", []))

        # 새 명령 감지
        new_commands = sorted(list(curr_set - prev_set))
        # 사라진 명령 감지
        missing_commands = sorted(list(prev_set - curr_set))

        auto_managed_map = {item["command"]: item for item in prev_auto}
        target_has_change = False

        # 6. 새 명령을 자동 관리 구역에 추가
        for cmd in new_commands:
            cat = curr_dict.get(cmd, "CLI 명령")
            if cmd not in auto_managed_map:
                auto_managed_map[cmd] = {
                    "command": cmd,
                    "category": cat,
                    "status": "new",
                    "status_text": "신규 감지",
                    "date": bottom_date_kst,
                }
                target_has_change = True
            elif auto_managed_map[cmd].get("status") == "unconfirmed":
                auto_managed_map[cmd]["status"] = "new"
                auto_managed_map[cmd]["status_text"] = "신규 감지"
                auto_managed_map[cmd]["date"] = bottom_date_kst
                target_has_change = True

        # 7. 사라진 명령을 자동 관리 구역에 '공식 문서에서 확인되지 않음'으로 표시
        for cmd in missing_commands:
            cat = target_snap.get("command_categories", {}).get(cmd, "CLI 명령")
            if cmd not in auto_managed_map:
                auto_managed_map[cmd] = {
                    "command": cmd,
                    "category": cat,
                    "status": "unconfirmed",
                    "status_text": "공식 문서에서 확인되지 않음",
                    "date": bottom_date_kst,
                }
                target_has_change = True
            elif auto_managed_map[cmd].get("status") != "unconfirmed":
                auto_managed_map[cmd]["status"] = "unconfirmed"
                auto_managed_map[cmd]["status_text"] = "공식 문서에서 확인되지 않음"
                auto_managed_map[cmd]["date"] = bottom_date_kst
                target_has_change = True

        # 정렬된 auto_managed 리스트
        merged_auto = sorted(
            auto_managed_map.values(),
            key=lambda x: (x.get("status") != "new", x["command"]),
        )

        updated_snapshot_targets[target] = {
            "commands": sorted(list(curr_set)),
            "command_categories": curr_dict,
            "auto_managed": merged_auto,
        }

        if target_has_change:
            modified_targets.add(target)

    # 10. 변경이 없으면 파일을 바꾸지 않음
    if not modified_targets:
        print("공식 문서 변경 사항이 없습니다. 파일을 변경하지 않습니다.")
        sys.exit(0)

    if check_only:
        print(f"[dry-run] 변경 감지 대상: {', '.join(sorted(modified_targets))}. 파일 변경 생략.")
        sys.exit(0)

    # 변경 적용
    new_html = html_content
    for target in modified_targets:
        rows = updated_snapshot_targets[target]["auto_managed"]
        new_html = update_auto_managed_html(new_html, target, rows)
        # 8. 상단 갱신 날짜와 하단 확인 기준 날짜를 KST 날짜로 바꿈
        new_html = update_dates(new_html, target, top_date_kst, bottom_date_kst)

    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        f.write(new_html)

    save_snapshot({
        "version": 1,
        "created_at": prev_snapshot.get("created_at", bottom_date_kst),
        "last_updated": bottom_date_kst,
        "targets": updated_snapshot_targets,
    })

    print(f"문서 갱신 완료: {', '.join(sorted(modified_targets))} 변경 반영 (KST: {bottom_date_kst})")


if __name__ == "__main__":
    main()
