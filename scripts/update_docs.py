#!/usr/bin/env python3
"""공식 문서의 명령 변화를 data/docs.json에 반영합니다."""

from datetime import datetime, timedelta, timezone
import html
import json
from pathlib import Path
import re
import sys
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = ROOT / "data" / "docs.json"
SOURCES_PATH = ROOT / "sources.json"
SNAPSHOT_PATH = ROOT / ".source-cache" / "snapshot.json"
TARGETS = {"codex": "codex", "claude": "claude", "gemini": "gemini", "agy": "antigravity", "grok": "grok"}
KST = timezone(timedelta(hours=9))


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


def validate_docs(data: dict) -> None:
    documents = data.get("documents")
    if not isinstance(documents, list):
        raise ValueError("data/docs.json의 documents 배열이 없습니다.")
    by_slug = {document.get("slug"): document for document in documents}
    required = {"hanstree", *TARGETS.values()}
    if set(by_slug) != required:
        raise ValueError(f"문서 구성이 올바르지 않습니다: {sorted(by_slug)}")
    for slug, document in by_slug.items():
        for field in ("title", "description", "sources", "updated", "updatedIso", "sections", "commands", "autoManaged", "bodyHtml"):
            if field not in document:
                raise ValueError(f"{slug} 문서의 {field} 값이 없습니다.")
        if not document["bodyHtml"] or not document["sections"]:
            raise ValueError(f"{slug} 문서 본문이 비어 있습니다.")


def fetch_url(url: str, timeout: int = 30) -> str:
    request = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 AgentTutor/2.0",
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    })
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        content_type = response.headers.get("Content-Type", "")
        match = re.search(r"charset=([^;\s]+)", content_type, re.IGNORECASE)
        return response.read().decode(match.group(1) if match else "utf-8", errors="replace")


def extract_raw_snippets(text: str) -> list[str]:
    snippets = []
    for match in re.findall(r"<code\b[^>]*>([\s\S]*?)</code>", text, re.IGNORECASE):
        cleaned = html.unescape(re.sub(r"<[^>]+>", "", match)).strip()
        if cleaned:
            snippets.append(cleaned)
    snippets.extend(html.unescape(match).strip() for match in re.findall(r"`([^`\r\n]+)`", text) if match.strip())
    for match in re.findall(r"<pre\b[^>]*>([\s\S]*?)</pre>", text, re.IGNORECASE):
        snippets.extend(line.strip() for line in html.unescape(re.sub(r"<[^>]+>", "", match)).splitlines() if line.strip())
    return snippets


def normalize_command(raw: str, target: str) -> tuple[str, str] | None:
    text = re.sub(r"\s+", " ", re.sub(r"\s+#.*$", "", re.sub(r"^[$\s>%#]+\s*", "", html.unescape(raw).strip()))).strip()
    if not 2 <= len(text) <= 100 or text.startswith(("http://", "https://", "//", "@")):
        return None
    if re.search(r"\.(?:py|js|ts|json|md|html|css|sh|txt)\b", text) or text.count("/") >= 2:
        return None
    if text.startswith("/"):
        match = re.match(r"^(/[a-zA-Z0-9_-]+)", text)
        return (match.group(1), "슬래시 명령") if match else None
    if text.lower() == target or text.lower().startswith(target + " "):
        parts = [text.split()[0].lower()]
        for part in text.split()[1:]:
            if part.startswith(("-", "<", "[")):
                break
            parts.append(part)
        return re.sub(r"\s*\(.*?\)", "", " ".join(parts)).strip(), "CLI 명령"
    match = re.match(r"^(--[a-zA-Z0-9_-]+)", text) if text.startswith("--") else re.match(r"^(-[a-zA-Z0-9])", text) if text.startswith("-") and len(text) <= 3 else None
    return (match.group(1), "옵션/플래그") if match else None


def extract_commands(text: str, target: str) -> dict[str, str]:
    commands = {}
    for snippet in extract_raw_snippets(text):
        parts = re.split(r"[\s,]+/[/\s]+|,\s*", snippet) if "," in snippet or " / " in snippet else [snippet]
        for part in parts:
            result = normalize_command(part, target)
            if result:
                commands[result[0]] = result[1]
    return commands


def main() -> None:
    check_only = "--check" in sys.argv or "--dry-run" in sys.argv
    validate_only = "--validate" in sys.argv
    try:
        data = read_json(DATA_PATH)
        validate_docs(data)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        raise SystemExit(f"[검증 실패] {error}")
    if validate_only:
        print("data/docs.json 문서 6개 구조가 정상입니다.")
        return

    sources = read_json(SOURCES_PATH)
    snapshot = read_json(SNAPSHOT_PATH) if SNAPSHOT_PATH.exists() else None
    fetched = {}
    errors = {}
    for target in TARGETS:
        source_list = sources.get(target, {}).get("sources", [])
        if not source_list:
            errors[target] = "출처 URL이 없습니다."
            continue
        combined = ""
        for source in source_list:
            try:
                content = fetch_url(source["url"])
                if len(content.strip()) < 100:
                    raise ValueError("내용이 100바이트보다 작습니다.")
                combined += "\n" + content
            except Exception as error:
                errors[target] = f"{source['url']}: {error}"
                break
        if target in errors:
            continue
        commands = extract_commands(combined, target)
        previous = snapshot.get("targets", {}).get(target, {}).get("commands", []) if snapshot else []
        if not commands:
            errors[target] = "유효한 명령어가 추출되지 않았습니다."
        elif previous and len(commands) < len(previous) * 0.5:
            errors[target] = f"명령어가 비정상적으로 감소했습니다 ({len(previous)} → {len(commands)})."
        else:
            fetched[target] = commands

    if errors:
        print("[실패 종료] 기존 데이터를 보존합니다.", file=sys.stderr)
        for target, error in errors.items():
            print(f"- {target}: {error}", file=sys.stderr)
        raise SystemExit(1)

    now = datetime.now(KST)
    display_date, iso_date = now.strftime("%Y년 %m월 %d일"), now.strftime("%Y-%m-%d")
    documents = {document["slug"]: document for document in data["documents"]}
    previous_targets = snapshot.get("targets", {}) if snapshot else {}
    changed = []
    next_targets = {}
    for target, slug in TARGETS.items():
        current = fetched[target]
        previous = previous_targets.get(target, {})
        previous_set, current_set = set(previous.get("commands", [])), set(current)
        managed = {item["command"]: item for item in documents[slug]["autoManaged"]}
        target_changed = False
        for command in sorted(current_set - previous_set):
            item = managed.get(command)
            if not item or item.get("status") == "unconfirmed":
                managed[command] = {"command": command, "category": current[command], "status": "new", "statusText": "신규 감지", "date": iso_date}
                target_changed = True
        for command in sorted(previous_set - current_set):
            item = managed.get(command)
            if not item or item.get("status") != "unconfirmed":
                managed[command] = {"command": command, "category": previous.get("command_categories", {}).get(command, "CLI 명령"), "status": "unconfirmed", "statusText": "공식 문서에서 확인되지 않음", "date": iso_date}
                target_changed = True
        managed_rows = sorted(managed.values(), key=lambda item: (item.get("status") != "new", item["command"]))
        next_targets[target] = {"commands": sorted(current_set), "command_categories": current, "auto_managed": managed_rows}
        if target_changed:
            documents[slug]["autoManaged"] = managed_rows
            documents[slug]["updated"] = display_date
            documents[slug]["updatedIso"] = iso_date
            changed.append(target)

    if check_only:
        print(f"[dry-run] 변경 감지: {', '.join(changed)}" if snapshot and changed else "공식 문서 변경 사항이 없습니다. 파일을 변경하지 않습니다.")
        return
    if not snapshot:
        write_json(SNAPSHOT_PATH, {"version": 1, "created_at": iso_date, "last_updated": iso_date, "targets": next_targets})
        print("기준 스냅샷을 생성했습니다. 문서 파일은 변경하지 않습니다.")
        return
    if not changed:
        print("공식 문서 변경 사항이 없습니다. 파일을 변경하지 않습니다.")
        return
    if changed:
        write_json(DATA_PATH, data)
    write_json(SNAPSHOT_PATH, {"version": 1, "created_at": snapshot.get("created_at", iso_date) if snapshot else iso_date, "last_updated": iso_date, "targets": next_targets})
    print(f"문서 갱신 완료: {', '.join(changed)}" if changed else "공식 문서 변경 사항이 없습니다. 문서 파일을 변경하지 않습니다.")


if __name__ == "__main__":
    main()
