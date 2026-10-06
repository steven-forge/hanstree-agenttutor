#!/usr/bin/env python3
"""핵심용어 사전 예약 검토. 후보 풀(data/glossary-candidates.json)의 용어가 학습 문서에 쓰이고
공식 출처가 확인될 때만 data/glossary.json 끝에 추가한다. 실패하면 사전을 바꾸지 않는다."""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys
import urllib.error
import urllib.parse
import urllib.request

from news_policy import load_policy

ROOT = Path(__file__).resolve().parent.parent
GLOSSARY_PATH = ROOT / "data" / "glossary.json"
CANDIDATES_PATH = ROOT / "data" / "glossary-candidates.json"
DOC_PATHS = (ROOT / "data" / "learn.json", ROOT / "data" / "agent-engineering.json")
KST = timezone(timedelta(hours=9))
TIMEOUT = 20
MAX_BYTES = 5 * 1024 * 1024
OFFICIAL_HOSTS = {"developers.google.com", "huggingface.co"}
TERM_KEYS = {"id", "term", "korean", "aliases", "category", "definition", "example", "related_ids", "links", "sources"}
# 본문에서 이 표현이 보일 때만 해당 후보를 쓰이는 용어로 본다. (일반 단어 '추론' 단독은 제외)
USAGE = {"tokenization": ("tokenization", "토큰화"), "temperature": ("temperature",), "inference": ("inference", "모델 추론")}


def norm(value: str) -> str:
    return " ".join(value.split()).casefold()


def names(term: dict) -> set[str]:
    return {norm(x) for x in [term["id"], term["term"], term["korean"], *term["aliases"]]}


def due(reviewed_at: str, days: int, now: datetime) -> bool:
    last = datetime.fromisoformat(reviewed_at.replace("Z", "+00:00")).astimezone(KST).date()
    return (now.astimezone(KST).date() - last).days >= days  # KST 달력 날짜 기준


class SameHostHttps(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target, origin = urllib.parse.urlsplit(newurl), urllib.parse.urlsplit(req.full_url)
        if target.scheme != "https" or target.hostname != origin.hostname or target.username or target.password:
            raise ValueError("출처 리다이렉트는 같은 호스트의 HTTPS만 허용합니다.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def source_has_term(url: str, term: str) -> bool:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in OFFICIAL_HOSTS or parts.username or parts.password:
        raise ValueError(f"허용되지 않은 출처 주소: {url}")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), SameHostHttps())
    request = urllib.request.Request(url, headers={"User-Agent": "AgentTutor-Glossary-Review/1.0"})
    try:
        with opener.open(request, timeout=TIMEOUT) as response:
            if response.status != 200:
                raise ValueError(f"출처 응답 {response.status}: {url}")
            body = response.read(MAX_BYTES + 1)
    except (urllib.error.URLError, TimeoutError) as error:
        raise ValueError(f"출처에 접근하지 못했습니다: {url}") from error
    if len(body) > MAX_BYTES:
        raise ValueError(f"출처 응답이 너무 큽니다: {url}")
    return term.casefold() in body.decode("utf-8", errors="replace").casefold()  # HTML은 문자열로만 검사


def review(force: bool, now: datetime) -> str:
    days = load_policy()["glossary_review_interval_days"]
    glossary = json.loads(GLOSSARY_PATH.read_text(encoding="utf-8"))
    if not force and not due(glossary["reviewed_at"], days, now):
        return f"검토 주기({days}일) 전이라 건너뜁니다."
    docs = "\n".join(path.read_text(encoding="utf-8") for path in DOC_PATHS).casefold()
    taken = set().union(*(names(t) for t in glossary["terms"]))
    ids = {t["id"] for t in glossary["terms"]}
    added = []
    for term in json.loads(CANDIDATES_PATH.read_text(encoding="utf-8"))["terms"]:
        if set(term) != TERM_KEYS or term["id"] not in USAGE or not term["sources"]:
            raise ValueError(f"후보 형식 오류: {term.get('id')}")
        if names(term) & taken or not any(marker in docs for marker in USAGE[term["id"]]):
            continue  # 이미 있거나 본문에서 쓰이지 않음
        if not set(term["related_ids"]) <= ids:
            raise ValueError(f"후보 {term['id']}의 related_ids가 사전에 없습니다.")
        for source in term["sources"]:
            if not source_has_term(source["url"], term["term"]):
                raise ValueError(f"출처에서 '{term['term']}'을 확인하지 못했습니다: {source['url']}")
        added.append({**term, "is_new": True})
        taken |= names(term)
        ids.add(term["id"])
    stamp = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
    glossary["reviewed_at"] = stamp
    if added:
        glossary["updated_at"] = stamp
        glossary["terms"].extend(added)
    temporary = GLOSSARY_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(glossary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(GLOSSARY_PATH)
    return f"검토 완료: 새 용어 {len(added)}개 추가 ({', '.join(t['term'] for t in added) or '없음'})"


def main() -> None:
    parser = argparse.ArgumentParser(description="핵심용어 사전 예약 검토")
    parser.add_argument("--force", action="store_true", help="검토 주기와 무관하게 실행")
    args = parser.parse_args()
    try:
        print(review(args.force, datetime.now(timezone.utc)))
    except (OSError, ValueError, KeyError, TypeError, UnicodeError) as error:
        print(f"용어 검토 실패: {error}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
