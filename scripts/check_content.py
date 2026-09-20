#!/usr/bin/env python3
"""AgentTutor 자체 점검 스크립트: 외부 네트워크/의존성 없이 표준 라이브러리로 무결성을 검증합니다."""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from collect_content import (
    validate_url,
    canonicalize_url,
    parse_rss_feed,
    parse_atom_releases,
    ALLOWED_HOSTS,
    KNOWN_TRACKING_PARAMS,
)
from publish_news import validate_reviewed_edition, FORBIDDEN_KEYWORDS


def test_rss_validation():
    now = datetime.now(timezone.utc)
    w_start = now - timedelta(hours=24)
    w_end = now

    # 1. Timezone missing in pubDate -> held
    xml_no_tz = b"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>Test Article</title>
          <link>https://openai.com/news/test</link>
          <pubDate>Sun, 20 Sep 2026 00:00:00</pubDate>
          <description>Test description</description>
        </item>
      </channel>
    </rss>"""
    cands, held, excluded = parse_rss_feed(xml_no_tz, "test-src", "Test Source", w_start, w_end)
    assert held == 1, f"Expected held==1 for missing timezone, got {held}"
    assert len(cands) == 0

    # 2. Unsafe URL (non-HTTPS or unauthorized host or port/userinfo) -> held
    xml_unsafe_url = b"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>Malicious Article</title>
          <link>http://evil.com/news</link>
          <pubDate>Sun, 20 Sep 2026 00:00:00 +0000</pubDate>
          <description>Test description</description>
        </item>
      </channel>
    </rss>"""
    cands, held, excluded = parse_rss_feed(xml_unsafe_url, "test-src", "Test Source", w_start, w_end)
    assert held == 1, f"Expected held==1 for unsafe URL, got {held}"
    assert len(cands) == 0

    # 3. Valid RSS article within window
    pub_in_window = (now - timedelta(hours=2)).strftime("%a, %d %b %Y %H:%M:%S +0000")
    xml_valid = f"""<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Valid Feed</title>
        <item>
          <title>Valid Article</title>
          <link>https://openai.com/news/valid-item?utm_source=feed&amp;ref=ignore&amp;source=rss</link>
          <pubDate>{pub_in_window}</pubDate>
          <description>Valid content</description>
        </item>
      </channel>
    </rss>""".encode("utf-8")
    cands, held, excluded = parse_rss_feed(xml_valid, "openai-news", "OpenAI News", w_start, w_end)
    assert held == 0, f"Expected held==0, got {held}"
    assert len(cands) == 1
    assert cands[0]["source_url"] == "https://openai.com/news/valid-item"


def test_atom_validation():
    now = datetime.now(timezone.utc)
    w_start = now - timedelta(hours=24)
    w_end = now

    # 1. Invalid root element -> raises RuntimeError
    xml_bad_root = b"""<html xmlns="http://www.w3.org/1999/xhtml"><body>Not an Atom feed</body></html>"""
    try:
        parse_atom_releases(xml_bad_root, "test-atom", "Test Atom", "openai/codex", w_start, w_end)
        assert False, "Expected RuntimeError on invalid Atom root"
    except RuntimeError:
        pass

    # 2. Prerelease filtering on tag/title -> excluded
    xml_prerelease = b"""<?xml version="1.0" encoding="UTF-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Codex Releases</title>
      <entry>
        <title>v1.5.0-beta.1 Preview</title>
        <link rel="alternate" type="text/html" href="https://github.com/openai/codex/releases/tag/v1.5.0-beta.1"/>
        <updated>2026-09-20T00:00:00Z</updated>
      </entry>
    </feed>"""
    cands, held, excluded = parse_atom_releases(xml_prerelease, "codex-releases", "Codex Releases", "openai/codex", w_start, w_end)
    assert excluded == 1, f"Expected excluded==1 for prerelease, got {excluded}"
    assert held == 0
    assert len(cands) == 0


def test_canonicalization_and_allowlist():
    assert "platform.claude.com" in ALLOWED_HOSTS
    assert "gemini.google" in ALLOWED_HOSTS

    # Tracking params dropped, semantic params preserved
    url = "https://anthropic.com/news/article?utm_campaign=launch&ref=feed&source=rss&reference=keep_this&source_id=123"
    canonical = canonicalize_url(url)
    assert "utm_campaign" not in canonical
    assert "ref=feed" not in canonical
    assert "source=rss" not in canonical
    assert "reference=keep_this" in canonical
    assert "source_id=123" in canonical


def test_publisher_validation():
    now = datetime.now(timezone.utc)
    w_start = now - timedelta(hours=24)
    w_end = now
    kst_now = now.astimezone(timezone(timedelta(hours=9)))
    edition_date = kst_now.strftime("%Y-%m-%d")

    base_candidates = {
        "collected_at": now.isoformat(),
        "window_start": w_start.isoformat(),
        "window_end": w_end.isoformat(),
        "edition_date": edition_date,
        "candidates": [
            {
                "id": "item123",
                "title": "테스트 기사",
                "source_id": "openai-news",
                "source_name": "OpenAI News",
                "source_url": "https://openai.com/news/test",
                "published_at": (now - timedelta(hours=5)).isoformat(),
                "evidence": "근거 내용"
            }
        ]
    }

    base_health = {
        "news": {
            "checked_at": now.isoformat(),
            "status": "ok",
            "candidate_count": 1,
            "sources": [
                {"id": "openai-news", "status": "ok", "count": 1, "held_count": 0}
            ]
        }
    }

    current_today = {
        "edition_date": (kst_now - timedelta(days=1)).strftime("%Y-%m-%d"),
        "collected_at": (now - timedelta(days=1)).isoformat()
    }

    reviewed = {
        "edition_date": edition_date,
        "window_start": w_start.isoformat(),
        "window_end": w_end.isoformat(),
        "collected_at": now.isoformat(),
        "reviewed_at": (now + timedelta(minutes=1)).isoformat(),
        "articles": [
            {
                "id": "item123",
                "title": "테스트 기사 한국어 번역",
                "summary": "한국어 요약 설명이 포함된 정상 기사 본문입니다.",
                "why_it_matters": "초보자 관점에서 중요한 기술적 이유 설명입니다.",
                "source_id": "openai-news",
                "source_name": "OpenAI News",
                "source_url": "https://openai.com/news/test",
                "published_at": (now - timedelta(hours=5)).isoformat()
            }
        ]
    }

    # 1. Valid edition passes
    validate_reviewed_edition(reviewed, base_candidates, base_health, current_today)

    # 2. Rejection: zero edition when held items exist
    zero_reviewed = dict(reviewed)
    zero_reviewed["articles"] = []
    health_with_held = {
        "news": {
            "checked_at": now.isoformat(),
            "status": "partial",
            "candidate_count": 0,
            "sources": [{"id": "anthropic-news", "status": "partial", "count": 0, "held_count": 2}]
        }
    }
    empty_candidates = dict(base_candidates)
    empty_candidates["candidates"] = []
    try:
        validate_reviewed_edition(zero_reviewed, empty_candidates, health_with_held, current_today)
        assert False, "Expected ValueError on zero edition with held sources"
    except ValueError:
        pass

    # 3. Rejection: article published outside window
    outside_reviewed = json.loads(json.dumps(reviewed))
    outside_reviewed["articles"][0]["published_at"] = (now - timedelta(hours=30)).isoformat()
    try:
        validate_reviewed_edition(outside_reviewed, base_candidates, base_health, current_today)
        assert False, "Expected ValueError for article published outside window"
    except ValueError:
        pass

    # Same-day rollback must be rejected rather than swallowed by an except block.
    newer_current = {"edition_date": edition_date, "collected_at": (now + timedelta(minutes=2)).isoformat()}
    try:
        validate_reviewed_edition(reviewed, base_candidates, base_health, newer_current)
        assert False, "Expected ValueError on same-day rollback"
    except ValueError:
        pass


def test_dataset_integrity():
    learn_path = ROOT / "data" / "learn.json"
    eng_path = ROOT / "data" / "agent-engineering.json"
    glossary_path = ROOT / "data" / "glossary.json"

    assert learn_path.exists(), "learn.json missing"
    assert eng_path.exists(), "agent-engineering.json missing"
    assert glossary_path.exists(), "glossary.json missing"

    with learn_path.open("r", encoding="utf-8") as f:
        learn_data = json.load(f)
    with eng_path.open("r", encoding="utf-8") as f:
        eng_data = json.load(f)
    with glossary_path.open("r", encoding="utf-8") as f:
        glossary_data = json.load(f)

    glossary_ids = {t["id"] for t in glossary_data.get("terms", [])}
    assert len(glossary_ids) == len(glossary_data.get("terms", [])), "Duplicate glossary IDs found"

    learn_ids = {d["id"] for d in learn_data.get("documents", [])}
    assert len(learn_ids) == len(learn_data.get("documents", [])), "Duplicate learn document IDs found"

    eng_ids = {d["id"] for d in eng_data.get("documents", [])}
    assert len(eng_ids) == len(eng_data.get("documents", [])), "Duplicate engineering document IDs found"

    # All related_glossary_ids in learn.json must exist in glossary
    for doc in learn_data.get("documents", []):
        for gid in doc.get("related_glossary_ids", []):
            assert gid in glossary_ids, f"Learn doc {doc['id']} references unknown glossary ID '{gid}'"

    # All related_glossary_ids in agent-engineering.json must exist in glossary
    for doc in eng_data.get("documents", []):
        for gid in doc.get("related_glossary_ids", []):
            assert gid in glossary_ids, f"Engineering doc {doc['id']} references unknown glossary ID '{gid}'"


def main():
    print("[1/5] RSS 유효성 검증 테스트 실행...")
    test_rss_validation()
    print("[2/5] Atom 피드 유효성 및 프리릴리즈 필터 테스트 실행...")
    test_atom_validation()
    print("[3/5] URL 정규화 및 명시적 허용목록 테스트 실행...")
    test_canonicalization_and_allowlist()
    print("[4/5] 뉴스 발행 검증 및 공개본 보호 테스트 실행...")
    test_publisher_validation()
    print("[5/5] 데이터셋 고유 ID 및 용어사전 참조 정합성 검증...")
    test_dataset_integrity()
    print("모든 자체 점검(check_content) 테스트가 성공적으로 통과되었습니다.")


if __name__ == "__main__":
    main()
