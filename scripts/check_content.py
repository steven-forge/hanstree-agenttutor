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
    parse_release_page,
    classify_date,
    merge_archive,
    article_sort_key,
    new_stats,
    ALLOWED_HOSTS,
    KNOWN_TRACKING_PARAMS,
    WINDOW_DAYS,
)
from publish_news import validate_reviewed_edition, apply_reviewed_edition, FORBIDDEN_KEYWORDS


def test_rss_validation():
    assert WINDOW_DAYS == 60, "기본 수집 범위는 고정 60일이어야 합니다"
    now = datetime.now(timezone.utc)
    w_start = now - timedelta(days=WINDOW_DAYS)
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
    cands, stats = parse_rss_feed(xml_no_tz, "test-src", "Test Source", w_start, w_end)
    held = stats["held_count"]
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
    cands, stats = parse_rss_feed(xml_unsafe_url, "test-src", "Test Source", w_start, w_end)
    held = stats["held_count"]
    assert held == 1, f"Expected held==1 for unsafe URL, got {held}"
    assert len(cands) == 0

    # 3. Valid RSS article within the 60-day window (older than the former 7-day limit)
    pub_in_window = (now - timedelta(days=45)).strftime("%a, %d %b %Y %H:%M:%S +0000")
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
    cands, stats = parse_rss_feed(xml_valid, "openai-news", "OpenAI News", w_start, w_end)
    assert stats["held_count"] == 0, f"Expected held==0, got {stats['held_count']}"
    assert len(cands) == 1
    assert cands[0]["source_url"] == "https://openai.com/news/valid-item"
    assert cands[0]["date_precision"] == "time" and cands[0]["source_summary"] == "Valid content"
    assert stats["coverage_limited"] is True, "피드가 60일 시작에 닿지 않으면 한계를 기록해야 합니다"

    # 4. Already in archive (id 또는 정규화 URL) -> skipped, not re-added
    cands, stats = parse_rss_feed(xml_valid, "openai-news", "OpenAI News", w_start, w_end, (set(), {"https://openai.com/news/valid-item"}))
    assert len(cands) == 0 and stats["skipped_count"] == 1


def test_releases_and_date_precision():
    now = datetime.now(timezone.utc)
    w_start = now - timedelta(days=WINDOW_DAYS)
    w_end = now
    iso = lambda days: (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    base = "https://github.com/openai/codex/releases/tag/"

    releases = [
        {"tag_name": "v1.5.0", "name": "1.5.0", "html_url": base + "v1.5.0", "published_at": iso(30), "body": "<b>Fixes</b> " + "x" * 5000},
        {"tag_name": "v1.6.0-beta.1", "name": "1.6.0 beta", "html_url": base + "v1.6.0-beta.1", "published_at": iso(2), "prerelease": True},
        {"tag_name": "v1.6.0-rc.1", "name": "1.6.0", "html_url": base + "v1.6.0-rc.1", "published_at": iso(3)},
        {"tag_name": "v1.4.0", "name": "1.4.0", "html_url": "https://github.com/evil/repo/releases/tag/v1.4.0", "published_at": iso(10)},
        {"tag_name": "v1.0.0", "name": "1.0.0", "html_url": base + "v1.0.0", "published_at": iso(90)},
    ]
    cands, stats = [], new_stats()
    reached = parse_release_page(releases, "openai/codex", "codex-releases", "Codex Releases", w_start, w_end, (set(), set()), cands, stats)
    assert reached is True, "60일 시작보다 오래된 release를 만나면 페이지 순회를 멈춰야 합니다"
    assert [c["title"] for c in cands] == ["1.5.0"]
    assert stats["excluded_count"] == 2 and stats["held_count"] == 1
    assert len(cands[0]["source_summary"]) <= 500 and "<b>" not in cands[0]["source_summary"]

    # 날짜만 확인된 값: 시각을 만들지 않고 day 정밀도로 수용, 60일 밖은 old
    state, fields = classify_date(datetime(now.year, now.month, now.day) - timedelta(days=20), w_start, w_end)
    assert state == "ok" and fields["date_precision"] == "day" and "published_at" not in fields
    assert classify_date(datetime(now.year, now.month, now.day) - timedelta(days=62), w_start, w_end)[0] == "old"
    assert classify_date(now - timedelta(days=61), w_start, w_end)[0] == "old"
    assert classify_date(now + timedelta(hours=1), w_start, w_end)[0] == "future"


def test_archive_merge_and_sort():
    edited = {"id": "aaa", "title": "편집 제목", "summary": "편집 요약", "why_it_matters": "편집 해설",
              "source_url": "https://openai.com/index/a", "published_at": "2026-09-16T12:00:00+00:00"}
    today = {"articles": [edited]}
    snapshot = json.loads(json.dumps(edited))
    new_items = [
        {"id": "aaa", "title": "Overwrite attempt", "source_url": "https://openai.com/index/other", "published_at": "2026-09-16T12:00:00+00:00", "date_precision": "time"},
        {"id": "zzz", "title": "Same URL", "source_url": "https://openai.com/index/a/?utm_source=x", "published_at": "2026-09-16T12:00:00+00:00", "date_precision": "time"},
        {"id": "d2", "title": "Day B", "source_url": "https://www.anthropic.com/news/b", "published_on": "2026-09-16", "date_precision": "day"},
        {"id": "d1", "title": "Day A", "source_url": "https://www.anthropic.com/news/a", "published_on": "2026-09-16", "date_precision": "day"},
        {"id": "d1", "title": "Day A dup", "source_url": "https://www.anthropic.com/news/a2", "published_on": "2026-09-16", "date_precision": "day"},
        # 2026-09-16 16:00 UTC = KST 09-17 01:00 → KST 기준으로 하루 뒤 날짜에 속한다
        {"id": "t1", "title": "Late", "source_url": "https://x.ai/news/late", "published_at": "2026-09-16T16:00:00+00:00", "date_precision": "time"},
        {"id": "t2", "title": "Later same day", "source_url": "https://x.ai/news/later", "published_at": "2026-09-16T14:00:00+00:00", "date_precision": "time"},
    ]
    added, changed = merge_archive(today, new_items)
    assert changed and [a["id"] for a in added] == ["d2", "d1", "t1", "t2"]
    assert [a["id"] for a in today["articles"]] == ["t1", "t2", "aaa", "d1", "d2"]
    assert next(a for a in today["articles"] if a["id"] == "aaa") == snapshot, "기존 편집 필드는 덮어쓰면 안 됩니다"

    # 재실행: 추가 0건·변화 없음 → today.json을 다시 쓰지 않는다
    added, changed = merge_archive(today, new_items)
    assert added == [] and changed is False


def test_today_archive_integrity():
    with (ROOT / "data" / "today.json").open("r", encoding="utf-8") as f:
        articles = json.load(f).get("articles", [])
    ids = [a["id"] for a in articles]
    urls = [canonicalize_url(a["source_url"]) for a in articles]
    assert len(set(ids)) == len(ids), "today.json에 중복 id가 있습니다"
    assert len(set(urls)) == len(urls), "today.json에 중복 정규화 URL이 있습니다"
    for a in articles:
        validate_url(a["source_url"])
        if a.get("date_precision") == "day":
            assert "published_at" not in a, f"{a['id']}: day 정밀도 항목에 시각이 있습니다"
            datetime.strptime(a["published_on"], "%Y-%m-%d")
        else:
            assert "published_on" not in a and datetime.fromisoformat(a["published_at"]).tzinfo is not None, f"{a['id']}: 시간대 포함 published_at 필요"
    # ponytail: 정렬은 60일 collector가 한 번 실행된 뒤에만 성립(기존 10건 판본은 미정렬). date_precision 항목이 생기면 검사.
    if any("date_precision" in a for a in articles):
        assert articles == sorted(articles, key=article_sort_key), "today.json articles 정렬 계약 위반"


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
    w_start = now - timedelta(days=WINDOW_DAYS)
    w_end = now
    kst_now = now.astimezone(timezone(timedelta(hours=9)))
    edition_date = kst_now.strftime("%Y-%m-%d")

    # 누적 archive: 자동 수집된 공식 메타데이터 항목 + 이미 편집된 다른 기사 11건(10건 초과 허용)
    collected = {
        "id": "item123",
        "title": "Test article",
        "source_id": "openai-news",
        "source_name": "OpenAI News",
        "source_url": "https://openai.com/news/test",
        "source_summary": "Official description",
        "published_at": (now - timedelta(days=40)).isoformat(),
        "date_precision": "time"
    }
    others = [
        {"id": f"other{n}", "title": "기존 제목", "summary": "기존 요약", "why_it_matters": "기존 해설",
         "source_url": f"https://openai.com/news/other{n}", "published_on": "2026-09-01", "date_precision": "day"}
        for n in range(11)
    ]
    current_today = {
        "edition_date": edition_date,
        "collected_at": now.isoformat(),
        "reviewed_at": None,
        "articles": [collected, *others]
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
                "published_at": (now - timedelta(days=40)).isoformat()
            }
        ]
    }

    # 1. 기존 전체 edition 형식(60일 윈도우, 10건 초과 archive)이 통과하고 편집 필드만 보강된다
    validate_reviewed_edition(reviewed, current_today)
    before = json.loads(json.dumps(current_today))
    merged = apply_reviewed_edition(reviewed, current_today)
    assert current_today == before, "입력 archive를 제자리에서 바꾸면 안 됩니다"
    assert len(merged["articles"]) == 12 and merged["articles"][1:] == others, "다른 기사는 그대로 보존"
    assert merged["articles"][0] == dict(collected, title=reviewed["articles"][0]["title"],
                                         summary=reviewed["articles"][0]["summary"],
                                         why_it_matters=reviewed["articles"][0]["why_it_matters"])
    assert merged["reviewed_at"] == reviewed["reviewed_at"] and merged["collected_at"] == current_today["collected_at"]
    assert apply_reviewed_edition(reviewed, merged) == merged, "같은 입력 재실행은 변화가 없어야 합니다"

    def rejected(bad, message):
        try:
            validate_reviewed_edition(bad, current_today)
        except ValueError:
            return
        assert False, message

    # 2. Rejection: empty edition, archive에 없는 기사, 공식 메타데이터 변조, 중복 id, 한국어 누락, 허용 외 필드
    rejected(dict(reviewed, articles=[]), "Expected ValueError on empty articles")
    rejected(dict(reviewed, articles=[dict(reviewed["articles"][0], id="unknown")]), "Expected ValueError on unknown id")
    rejected(dict(reviewed, articles=[dict(reviewed["articles"][0], published_at=now.isoformat())]), "Expected ValueError on changed published_at")
    rejected(dict(reviewed, articles=[dict(reviewed["articles"][0], source_url="https://openai.com/news/else")]), "Expected ValueError on changed URL")
    rejected(dict(reviewed, articles=reviewed["articles"] * 2), "Expected ValueError on duplicate id")
    rejected(dict(reviewed, articles=[dict(reviewed["articles"][0], summary="English only")]), "Expected ValueError on non-Korean summary")
    rejected(dict(reviewed, articles=[dict(reviewed["articles"][0], body="x")]), "Expected ValueError on unknown field")
    rejected(dict(reviewed, reviewed_at=(now + timedelta(hours=1)).isoformat()), "Expected ValueError on future reviewed_at")
    rejected(dict(reviewed, reviewed_at="2026-09-21T05:00:00"), "Expected ValueError on reviewed_at without timezone")


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
    print("[1/7] RSS 유효성·60일 범위·archive 건너뛰기 테스트 실행...")
    test_rss_validation()
    print("[2/7] Releases API 프리릴리즈 필터 및 날짜 정밀도 테스트 실행...")
    test_releases_and_date_precision()
    print("[3/7] URL 정규화 및 명시적 허용목록 테스트 실행...")
    test_canonicalization_and_allowlist()
    print("[4/7] 누적 archive 병합·중복 제거·정렬·편집 필드 보존 테스트 실행...")
    test_archive_merge_and_sort()
    print("[5/7] 편집 보강 검증 및 공개 archive 보호 테스트 실행...")
    test_publisher_validation()
    print("[6/7] data/today.json 중복·날짜 정밀도·정렬 검증...")
    test_today_archive_integrity()
    print("[7/7] 데이터셋 고유 ID 및 용어사전 참조 정합성 검증...")
    test_dataset_integrity()
    print("모든 자체 점검(check_content) 테스트가 성공적으로 통과되었습니다.")


if __name__ == "__main__":
    main()
