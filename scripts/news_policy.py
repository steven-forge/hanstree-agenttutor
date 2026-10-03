#!/usr/bin/env python3
"""뉴스 정책의 순수 검증과 CI용 공개 정책 동기화. 인증 정보는 사용하지 않는다."""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = ROOT / "data" / "news-policy.json"
POLICY_URL = "https://hanstree-agenttutor-jgwu.vercel.app/api/news-policy"
POLICY_HOST = "hanstree-agenttutor-jgwu.vercel.app"
MAX_BYTES = 64 * 1024
KST = timezone(timedelta(hours=9))
OFFICIAL_SOURCE_IDS = frozenset({"openai-news", "google-ai", "anthropic-news", "xai-news", "claude-dev-blog"})
EXTERNAL_SOURCE_IDS = frozenset({
    "hacker-news", "huggingface-blog", "wired-ai", "the-verge-ai", "techcrunch-ai", "ars-technica",
    "product-hunt", "the-new-stack-ai", "the-rundown-ai", "infoq-ai", "medium-ai", "venturebeat-ai",
    "youtube", "x", "reddit",
})
TOP_KEYS = {"schema_version", "revision", "updated_at", "collection_interval_hours", "official_window_days",
            "window_hours", "publish", "ai_keywords", "official_sources", "sources", "display", "daily_target"}


def _keys(value, expected: set | frozenset, label: str) -> None:
    if not isinstance(value, dict) or set(value) != expected:
        raise ValueError(f"{label}: 허용된 필드 전체가 정확히 필요합니다.")


def _integer(value, low: int, high: int, label: str) -> None:
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f"{label}: {low}~{high} 정수가 필요합니다.")


def _boolean(value, label: str) -> None:
    if type(value) is not bool:
        raise ValueError(f"{label}: true 또는 false가 필요합니다.")


def validate_policy(value: object) -> dict:
    """입력을 변경하지 않고 검증한다. 알 수 없는 필드·출처·자료형은 거부한다."""
    _keys(value, TOP_KEYS, "정책")
    _integer(value["schema_version"], 1, 1, "schema_version")
    _integer(value["revision"], 0, 9007199254740990, "revision")
    updated = value["updated_at"]
    if updated is not None:
        if not isinstance(updated, str) or len(updated) > 40 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)", updated):
            raise ValueError("updated_at: 시간대를 포함한 ISO 시각 또는 null이 필요합니다.")
        try:
            datetime.fromisoformat(updated.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError("updated_at: 유효한 ISO 시각이 필요합니다.") from error
    _integer(value["collection_interval_hours"], 1, 24, "collection_interval_hours")
    if value["collection_interval_hours"] not in (1, 2, 3, 6, 12, 24):
        raise ValueError("collection_interval_hours: 1, 2, 3, 6, 12, 24 중 하나가 필요합니다.")
    _integer(value["official_window_days"], 1, 60, "official_window_days")
    _integer(value["window_hours"], 1, 168, "window_hours")
    publish = value["publish"]
    _keys(publish, {"auto_publish", "official_single_source", "min_independent", "high_importance_at", "official_model_high"}, "publish")
    for key in ("auto_publish", "official_single_source", "official_model_high"):
        _boolean(publish[key], f"publish.{key}")
    _integer(publish["min_independent"], 1, 8, "publish.min_independent")
    _integer(publish["high_importance_at"], publish["min_independent"], 8, "publish.high_importance_at")
    keywords = value["ai_keywords"]
    if not isinstance(keywords, list) or not 1 <= len(keywords) <= 100:
        raise ValueError("ai_keywords: 1~100개 키워드가 필요합니다.")
    for keyword in keywords:
        if not isinstance(keyword, str) or not keyword.strip() or keyword != keyword.strip() or len(keyword.encode("utf-16-le")) // 2 > 80 or re.search(r"[\x00-\x1f\x7f]", keyword):
            raise ValueError("ai_keywords: 각 키워드는 공백만 아닌 1~80자여야 합니다.")
    if len({keyword.lower() for keyword in keywords}) != len(keywords):
        raise ValueError("ai_keywords: 대소문자가 다른 중복 키워드는 허용되지 않습니다.")
    _keys(value["official_sources"], OFFICIAL_SOURCE_IDS, "official_sources")
    for key, enabled in value["official_sources"].items():
        _boolean(enabled, f"official_sources.{key}")
    _keys(value["sources"], EXTERNAL_SOURCE_IDS, "sources")
    for key, source in value["sources"].items():
        _keys(source, {"enabled", "independent", "keyword_filter", "max_items"}, f"sources.{key}")
        for flag in ("enabled", "independent", "keyword_filter"):
            _boolean(source[flag], f"sources.{key}.{flag}")
        _integer(source["max_items"], 1, 100, f"sources.{key}.max_items")
    _keys(value["display"], {"page_size", "sort"}, "display")
    _integer(value["display"]["page_size"], 10, 50, "display.page_size")
    if value["display"]["page_size"] not in (10, 20, 30, 50) or value["display"]["sort"] not in ("latest", "importance"):
        raise ValueError("display: 허용된 페이지 크기와 정렬 방식이 필요합니다.")
    _integer(value["daily_target"], 1, 100, "daily_target")
    return value


def load_policy() -> dict:
    with POLICY_PATH.open("r", encoding="utf-8") as file:
        return validate_policy(json.load(file))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("정책 동기화의 리다이렉트는 허용되지 않습니다.")


def sync_policy() -> dict:
    local = load_policy()
    parts = urllib.parse.urlsplit(POLICY_URL)
    if parts.scheme != "https" or parts.hostname != POLICY_HOST or parts.port not in (None, 443) or parts.username or parts.password or parts.query or parts.fragment or parts.path != "/api/news-policy":
        raise ValueError("정책 동기화 주소가 고정된 운영 주소와 다릅니다.")
    # 프록시 환경 변수나 로그인·쿠키 저장소를 사용하지 않는 익명 GET이다.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    request = urllib.request.Request(POLICY_URL, headers={"Accept": "application/json", "Cache-Control": "no-cache", "User-Agent": "AgentTutor-News-Policy/1.0"})
    try:
        with opener.open(request, timeout=20) as response:
            if response.status != 200 or response.geturl() != POLICY_URL:
                raise ValueError("운영 정책이 정상 응답을 반환하지 않았습니다.")
            if response.headers.get_content_type() != "application/json":
                raise ValueError("운영 정책 응답이 JSON이 아닙니다.")
            payload = response.read(MAX_BYTES + 1)
    except urllib.error.URLError as error:
        raise ValueError("운영 정책을 가져오지 못했습니다. 뉴스 수집을 중단합니다.") from error
    if len(payload) > MAX_BYTES:
        raise ValueError("운영 정책 응답이 허용 크기를 초과했습니다.")
    remote = validate_policy(json.loads(payload.decode("utf-8")))
    if remote["revision"] < local["revision"]:
        raise ValueError("운영 정책 버전이 로컬보다 오래되어 수집을 중단합니다.")
    temporary = POLICY_PATH.with_suffix(".json.tmp")
    try:
        temporary.write_text(json.dumps(remote, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(POLICY_PATH)
    finally:
        if temporary.exists():
            temporary.unlink()
    return remote


def collection_due(policy: dict, event: str, schedule: str, now: datetime | None = None) -> bool:
    if event != "schedule":
        return True
    if schedule != "0 * * * *":
        return False  # 06:15 문서 확인은 뉴스 수집 주기와 별개다.
    return (now or datetime.now(KST)).astimezone(KST).hour % policy["collection_interval_hours"] == 0


def main() -> None:
    parser = argparse.ArgumentParser(description="뉴스 정책 검증·동기화·예약 주기 판정")
    parser.add_argument("command", choices=("sync", "due"))
    parser.add_argument("--event", default="workflow_dispatch")
    parser.add_argument("--schedule", default="")
    args = parser.parse_args()
    try:
        if args.command == "sync":
            policy = sync_policy()
            print(f"뉴스 정책 revision {policy['revision']} 동기화 완료")
        else:
            print("true" if collection_due(load_policy(), args.event, args.schedule) else "false")
    except (OSError, ValueError, UnicodeError) as error:
        print(f"정책 오류: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
