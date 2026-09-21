#!/usr/bin/env python3
"""AgentTutor 운영 배포의 버전, 주요 경로, 핵심 문구를 읽기 전용으로 확인합니다."""

import argparse
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BASE_URL = "https://hanstree-agenttutor-jgwu.vercel.app"
CORE_CHECKS = [
    ("/", "AI Agent 학습과 실무를"),
    ("/today", "AI 뉴스레터"),
    ("/releases", "릴리스 요약"),
    ("/learn", "Agent 기초 개념 학습"),
    ("/agent-engineering", "Agent 엔지니어링"),
    ("/agents", "주요 AI Agent 비교"),
    ("/docs/hanstree", "Hanstree"),
    ("/glossary", "핵심 용어사전"),
]


class BodyTextParser(HTMLParser):
    """스크립트를 제외한 body의 실제 텍스트만 모읍니다."""

    def __init__(self):
        super().__init__()
        self.in_body = False
        self.ignored_depth = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
        elif self.in_body and tag in {"script", "style", "template"}:
            self.ignored_depth += 1

    def handle_endtag(self, tag):
        if tag == "body":
            self.in_body = False
        elif self.in_body and tag in {"script", "style", "template"} and self.ignored_depth:
            self.ignored_depth -= 1

    def handle_data(self, data):
        if self.in_body and not self.ignored_depth:
            text = data.strip()
            if text:
                self.parts.append(text)


def normalize_base_url(value):
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("기본 주소는 http 또는 https 웹 주소여야 합니다")
    if parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise ValueError("기본 주소에는 인증 정보, 하위 경로, 쿼리, 조각을 넣을 수 없습니다")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def visible_text(body):
    parser = BodyTextParser()
    parser.feed(body)
    return " ".join(parser.parts)


def fetch_text(base_url, path, timeout):
    request = urllib.request.Request(
        f"{base_url}{path}",
        headers={"User-Agent": "AgentTutor-Live-Verifier/1.0", "Accept": "text/html"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}")
        charset = response.headers.get_content_charset() or "utf-8"
        return visible_text(response.read().decode(charset, errors="replace"))


def load_checks():
    package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    behavior = json.loads((ROOT / "data" / "ai-behavior.json").read_text(encoding="utf-8"))
    checks = CORE_CHECKS + [
        (f"/learn/ai-behavior/{item['slug']}", item["title"])
        for item in behavior
    ]
    return package["version"], checks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="검증할 배포의 루트 주소")
    parser.add_argument("--timeout", type=float, default=15, help="경로별 제한 시간(초)")
    args = parser.parse_args()

    if args.timeout <= 0:
        parser.error("--timeout은 0보다 커야 합니다")
    try:
        base_url = normalize_base_url(args.base_url)
    except ValueError as error:
        parser.error(str(error))

    version, checks = load_checks()
    failures = []
    for index, (path, marker) in enumerate(checks):
        try:
            text = fetch_text(base_url, path, args.timeout)
            if marker not in text:
                raise RuntimeError(f"핵심 문구 없음: {marker}")
            if index == 0 and f"v{version}" not in re.sub(r"\s+", "", text):
                raise RuntimeError(f"운영 버전 v{version} 확인 실패")
            print(f"[OK] {path} — {marker}")
        except (OSError, UnicodeError, urllib.error.URLError, RuntimeError) as error:
            failures.append((path, str(error)))
            print(f"[FAIL] {path} — {error}", file=sys.stderr)

    if failures:
        print(f"\n실패: {len(failures)}/{len(checks)}개 경로", file=sys.stderr)
        return 1
    print(f"\n완료: 운영 v{version}, {len(checks)}개 경로 확인")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
