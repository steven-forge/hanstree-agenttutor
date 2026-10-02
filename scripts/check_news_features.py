#!/usr/bin/env python3
"""뉴스 기능의 실제 구현(HTML/RSS 응답, publish_news.py 로직)을 점검하는 최소 확인 스크립트.

TS 헬퍼를 파이썬으로 재구현해 비교하지 않는다. 대신 실행 중인 서버(로컬 dev 또는 배포)의
실제 HTML/RSS 응답과, scripts/publish_news.py의 실제 함수를 그대로 불러와 검증한다.

실행: python3 scripts/check_news_features.py --base-url http://localhost:3000
프레임워크 없이 assert만 쓰며, 실패하면 0이 아닌 종료 코드를 낸다.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from unittest import mock
from zoneinfo import ZoneInfo
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from publish_news import apply_reviewed_edition  # noqa: E402
from verify_live_site import normalize_base_url, visible_text  # noqa: E402
import collect_content  # noqa: E402
import collect_hourly_news  # noqa: E402

ARTICLE_ID_RE = re.compile(r'id="article-([^"]+)"')
KOREAN_RE = re.compile(r"[가-힣]")


def read_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def fetch_raw(base_url: str, path: str, timeout: float) -> tuple[str, dict]:
    request = urllib.request.Request(
        f"{base_url}{path}",
        headers={"User-Agent": "AgentTutor-News-Checker/1.0"},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status} for {path}")
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace"), {k.lower(): v for k, v in response.headers.items()}


# ---- publish_news.py apply_reviewed_edition: 실제 함수 호출 ----

def check_apply_reviewed_edition() -> None:
    base_article = {
        "id": "a1",
        "title": "원제목",
        "summary": "원요약 한국어",
        "why_it_matters": "원해설 한국어",
        "source_url": "https://example.com/a1",
    }
    untouched_article = {
        "id": "a2",
        "title": "손대지 않은 기사",
        "summary": "요약2",
        "why_it_matters": "해설2",
        "source_url": "https://example.com/a2",
    }
    current_today = {"articles": [dict(base_article), dict(untouched_article)]}

    # 제목만 변경: why_it_matters_provenance는 붙으면 안 된다.
    title_only = {
        "reviewed_at": "2026-09-30T00:00:00+00:00",
        "articles": [{**base_article, "title": "새 제목"}],
    }
    merged = apply_reviewed_edition(title_only, current_today)
    a1 = next(a for a in merged["articles"] if a["id"] == "a1")
    assert a1["title"] == "새 제목", "title-only 편집이 반영되지 않았다."
    assert "why_it_matters_provenance" not in a1, "title-only 변경이 why_it_matters_provenance를 건드렸다."
    assert a1.get("reviewed_at") == title_only["reviewed_at"], "편집 필드가 바뀌면 기사별 reviewed_at은 기록돼야 한다."

    # why_it_matters만 변경: provenance는 editorial로 바뀌어야 한다.
    why_only = {
        "reviewed_at": "2026-09-30T01:00:00+00:00",
        "articles": [{**base_article, "why_it_matters": "새 해설 한국어"}],
    }
    merged2 = apply_reviewed_edition(why_only, current_today)
    a1b = next(a for a in merged2["articles"] if a["id"] == "a1")
    assert a1b["why_it_matters_provenance"] == "editorial", "why_it_matters 변경 시 provenance가 editorial이어야 한다."

    # 완전히 동일한 재제출: 기사별 reviewed_at이 새로 붙으면 안 된다.
    identical = {
        "reviewed_at": "2026-09-30T02:00:00+00:00",
        "articles": [dict(base_article)],
    }
    merged3 = apply_reviewed_edition(identical, current_today)
    a1c = next(a for a in merged3["articles"] if a["id"] == "a1")
    assert "reviewed_at" not in a1c, "무변경 재제출인데 기사별 reviewed_at이 붙었다."
    assert "why_it_matters_provenance" not in a1c, "무변경 재제출인데 provenance가 붙었다."

    # 편집 대상이 아닌 기사는 그대로 보존돼야 한다.
    a2 = next(a for a in merged3["articles"] if a["id"] == "a2")
    assert a2 == untouched_article, "편집 대상이 아닌 기사가 변경되었다."


# ---- 로컬 데이터(불변식): TS 로직을 재구현하지 않고 JSON 구조만 검증 ----

def check_editorial_links_resolve() -> None:
    editorial_path = ROOT / "data" / "news-editorial.json"
    glossary_path = ROOT / "data" / "glossary.json"
    today_path = ROOT / "data" / "today.json"
    if not editorial_path.exists() or not today_path.exists():
        return
    editorial = read_json(editorial_path)
    glossary_ids = {t["id"] for t in read_json(glossary_path).get("terms", [])} if glossary_path.exists() else set()
    articles_by_id = {a["id"]: a for a in read_json(today_path).get("articles", []) if isinstance(a, dict)}
    article_ids = set(articles_by_id)

    for art_id, entry in (editorial.get("articles") or {}).items():
        assert art_id in article_ids, f"편집 메모의 기사 {art_id}가 없다."
        ids = entry.get("related_glossary_ids") or []
        for gid in ids:
            assert gid in glossary_ids, f"기사 {art_id}의 related_glossary_ids에 존재하지 않는 용어 id: {gid}"
        assert len(ids) == len(set(ids)), f"기사 {art_id}의 related_glossary_ids에 중복이 있다."

        reading = entry.get("reading")
        if reading is not None:
            check_reading_shape(art_id, reading, articles_by_id.get(art_id))

    weekly = editorial.get("weekly")
    if weekly:
        for aid in weekly["article_ids"]:
            assert aid in article_ids, f"weekly.article_ids의 {aid}가 today.json에 없다."

    story = editorial.get("story")
    if story:
        for entry in story["entries"]:
            assert entry["article_id"] in article_ids, f"story entry의 {entry['article_id']}가 today.json에 없다."


def check_reading_shape(art_id: str, reading: dict, article: dict | None) -> None:
    assert isinstance(reading, dict), f"기사 {art_id}의 reading이 객체가 아니다."

    summary_ko = reading.get("summary_ko")
    assert isinstance(summary_ko, str) and summary_ko.strip(), f"기사 {art_id}의 reading.summary_ko가 비어 있다."
    assert KOREAN_RE.search(summary_ko), f"기사 {art_id}의 reading.summary_ko에 한국어가 없다."

    sections = reading.get("sections")
    assert isinstance(sections, list) and len(sections) >= 1, f"기사 {art_id}의 reading.sections은 1개 이상이어야 한다."
    section_word_count = 0
    for sec in sections:
        assert isinstance(sec, dict), f"기사 {art_id}의 reading.sections 항목이 객체가 아니다."
        heading, body = sec.get("heading"), sec.get("body")
        assert isinstance(heading, str) and heading.strip(), f"기사 {art_id}의 reading.sections heading이 비어 있다."
        assert isinstance(body, str) and body.strip(), f"기사 {art_id}의 reading.sections body가 비어 있다."
        assert KOREAN_RE.search(heading) and KOREAN_RE.search(body), f"기사 {art_id}의 reading.sections에 한국어가 없다."
        section_word_count += len(heading.split()) + len(body.split())

    total_ko_words = len(summary_ko.split()) + section_word_count
    excerpt = reading.get("excerpt")
    if excerpt is not None:
        assert isinstance(excerpt, dict), f"기사 {art_id}의 reading.excerpt가 객체가 아니다."
        original, ko = excerpt.get("original"), excerpt.get("ko")
        assert isinstance(original, str) and original.strip(), f"기사 {art_id}의 reading.excerpt.original이 비어 있다."
        original_words = len(original.split())
        assert original_words <= 25, f"기사 {art_id}의 reading.excerpt.original이 25단어를 초과한다: {original_words}"
        assert isinstance(ko, str) and ko.strip(), f"기사 {art_id}의 reading.excerpt.ko가 비어 있다."
        assert KOREAN_RE.search(ko), f"기사 {art_id}의 reading.excerpt.ko에 한국어가 없다."
        total_ko_words += len(ko.split()) + original_words

    assert total_ko_words <= 200, f"기사 {art_id}의 reading 요약·인용·번역 총 단어 수가 200을 초과한다: {total_ko_words}"

    source_url = reading.get("source_url")
    assert isinstance(source_url, str) and source_url.strip(), f"기사 {art_id}의 reading.source_url이 비어 있다."
    if article is not None:
        assert source_url == article.get("source_url"), f"기사 {art_id}의 reading.source_url이 아카이브 source_url과 다르다."

    checked_at = reading.get("checked_at")
    assert isinstance(checked_at, str) and checked_at.strip(), f"기사 {art_id}의 reading.checked_at이 비어 있다."
    parsed = datetime.fromisoformat(checked_at)
    assert parsed.tzinfo is not None, f"기사 {art_id}의 reading.checked_at에 시간대 정보가 없다."
    assert parsed <= datetime.now(parsed.tzinfo) + timedelta(minutes=5), f"기사 {art_id}의 원문 확인 시각이 미래다."

# ---- 실행 중인 서버의 실제 HTML/RSS 응답 점검 ----

def get_non_release_articles(today: dict) -> list[dict]:
    release_ids = {"codex-releases", "gemini-releases", "claude-releases", "grok-releases"}
    return [a for a in today.get("articles", []) if isinstance(a, dict) and a.get("source_id") not in release_ids]


def check_today_page(base_url: str, timeout: float, articles: list[dict]) -> None:
    def expect(query, expected):
        path = "/today?" + urllib.parse.urlencode(query)
        html, _ = fetch_raw(base_url, path, timeout)
        assert ARTICLE_ID_RE.findall(html) == [a["id"] for a in expected], f"{path} 기사 ID/순서 불일치"
        return html

    expect({}, articles[:10])
    expect({"date": "2026-02-31"}, articles[:10])
    expect({"page": "abc"}, [])
    expect({"page": "999999"}, [])
    if not articles:
        return
    sid = max({a["source_id"] for a in articles}, key=lambda s: sum(a["source_id"] == s for a in articles))
    source_articles = [a for a in articles if a["source_id"] == sid]
    expect({"source": sid}, source_articles[:10])
    if len(source_articles) > 10:
        expect({"source": sid, "page": 2}, source_articles[10:20])

    # KST 날짜 기대값은 표준 시간대 변환으로 계산한다. UTC와 날짜가 다른 사례도 확인한다.
    dates = {a["id"]: a.get("published_on") or datetime.fromisoformat(a["published_at"]).astimezone(ZoneInfo("Asia/Seoul")).date().isoformat() for a in articles}
    sample = next((a for a in articles if a.get("published_at") and dates[a["id"]] != a["published_at"][:10]), articles[0])
    day = dates[sample["id"]]
    expect({"date": day}, [a for a in articles if dates[a["id"]] == day][:10])
    editorial = read_json(ROOT / "data/news-editorial.json")
    notes = editorial["articles"]
    for topic in ("model", "tools", "safety", "unclassified"):
        expected = [a for a in articles if (not notes.get(a["id"], {}).get("topics") if topic == "unclassified" else topic in notes.get(a["id"], {}).get("topics", []))]
        expect({"topic": topic}, expected[:10])
    sample = next(a for a in articles if notes.get(a["id"], {}).get("topics"))
    topic, day, sid = notes[sample["id"]]["topics"][0], dates[sample["id"]], sample["source_id"]
    expected = [a for a in articles if a["source_id"] == sid and dates[a["id"]] == day and topic in notes.get(a["id"], {}).get("topics", [])]
    expect({"source": sid, "date": day, "topic": topic}, expected[:10])

    html, _ = fetch_raw(base_url, "/today", timeout)
    text = visible_text(html)
    for key in ("weekly", "story"):
        assert editorial[key]["title"] in text, f"{key} 실제 편집 내용 누락"
    assert "어떻게 모았나" in text and "모든 기사를 사람이 검토한 것은 아닙니다" in text

    candidates = read_json(ROOT / "data/today-candidates.json")
    for key, title in (("official_run", "공식 뉴스 실행별 집계"), ("hourly_run", "외부 매체 실행별 집계")):
        run = candidates.get(key)
        if run:
            section = text.split(title, 1)[1].split("위 집계", 1)[0]
            if key == "official_run":
                section = section.split("외부 매체 실행별 집계", 1)[0]
            compact = re.sub(r"\s+", "", section)
            assert "기록없음" not in compact, f"{key}: 운영 집계가 아직 반영되지 않았다."
            stamp = datetime.fromisoformat(run["collected_at"]).astimezone(ZoneInfo("Asia/Seoul"))
            assert stamp.strftime("%Y.%m.%d.%H:%M") in compact, f"{key}: 운영 집계 시각 불일치"
            if key == "official_run":
                assert f'반환된신규후보항목{run["candidate_count"]}건' in compact
                assert f'신규게시{run["published_count"]}건' in compact
            else:
                assert f'기존기사에병합된것제외){run["candidate_count"]}건' in compact
                assert f'대기{run["waiting_count"]}건' in compact
                assert f'게시보류{run["held_count"]}건' in compact
            assert f'실패{run["failed_source_count"]}곳' in compact
            assert run["candidate_count"] >= run["published_count"] >= 0
    if run := candidates.get("hourly_run"):
        assert run["candidate_count"] == run["waiting_count"] + run["eligible_count"]
        assert run["eligible_count"] == run["published_count"] + run["held_count"] + run["duplicate_count"]


def check_article_detail(base_url: str, timeout: float, articles: list[dict]) -> None:
    if not articles:
        return
    article = articles[0]
    html, _ = fetch_raw(base_url, f"/today/{article['id']}", timeout)
    text = visible_text(html)
    assert "요약" in text, "기사 상세에 요약 섹션이 없다."
    assert "왜 중요한가요" in text, "기사 상세에 '왜 중요한가요' 섹션이 없다."
    assert "원문" in text, "기사 상세에 원문 링크 섹션이 없다."
    assert "편집 기록" in text or "검토 기록" in text or "기록 없음" in text, \
        "기사 상세에 편집/검토 기록 표시가 없다."
    editorial = read_json(ROOT / "data/news-editorial.json")
    for aid, note in editorial["articles"].items():
        if not note.get("check_now"):
            continue
        html, _ = fetch_raw(base_url, f"/today/{aid}", timeout)
        text = visible_text(html)
        assert note["check_now"]["text"] in text and note["reviewed_by"] in text
        for gid in note.get("related_glossary_ids", []):
            assert f'href="/glossary#{gid}"' in html, f"용어 링크 누락: {gid}"

    # reading이 있는 기사는 일부만 골라 실제 표시 텍스트를 확인한다(전수 요청 방지).
    reading_ids = [aid for aid, note in editorial["articles"].items() if note.get("reading")]
    for aid in reading_ids[:3]:
        note = editorial["articles"][aid]
        reading = note["reading"]
        html, _ = fetch_raw(base_url, f"/today/{aid}", timeout)
        text = visible_text(html)
        assert "핵심 요약" in text, f"기사 {aid}에 핵심 요약 제목이 없다."
        assert reading["summary_ko"] in text, f"기사 {aid}의 reading.summary_ko가 화면에 없다."
        assert "한국어로 자세히 읽기" in text, f"기사 {aid}에 상세 읽기 섹션이 없다."
        for sec in reading["sections"]:
            assert sec["heading"] in text and sec["body"] in text, f"기사 {aid}의 reading.sections 텍스트가 화면에 없다."
        if reading.get("excerpt"):
            assert "짧은 원문과 번역" in text
            assert reading["excerpt"]["original"] in text and reading["excerpt"]["ko"] in text, f"기사 {aid}의 excerpt 텍스트가 화면에 없다."


def check_rss_feed(base_url: str, timeout: float, articles: list[dict]) -> None:
    body, headers = fetch_raw(base_url, "/feed.xml", timeout)
    content_type = headers.get("content-type", "")
    assert "application/rss+xml" in content_type, f"RSS Content-Type이 올바르지 않다: {content_type}"

    root = ET.fromstring(body)  # 유효한 XML이 아니면 여기서 예외 발생
    assert root.tag == "rss", "RSS 루트 엘리먼트가 <rss>가 아니다."
    channel = root.find("channel")
    assert channel is not None, "RSS에 <channel>이 없다."

    items = channel.findall("item")
    expected = min(50, len(articles))
    assert len(items) == expected, f"RSS 항목 수가 예상과 다르다: {len(items)} != {expected}"

    guids = [item.findtext("guid") for item in items]
    assert len(guids) == len(set(guids)), "RSS guid가 중복되었다."
    assert [guid.rsplit("/", 1)[-1] for guid in guids] == [a["id"] for a in articles[:50]], "RSS 기사 ID 또는 순서 불일치"

    articles_by_id = {a["id"]: a for a in articles}
    for item in items:
        link = item.findtext("link")
        guid = item.findtext("guid") or ""
        art_id = guid.rsplit("/", 1)[-1]
        matched = articles_by_id.get(art_id)
        assert matched, f"RSS에 없는 기사 ID: {art_id}"
        assert link == matched["source_url"], f"RSS link가 원문 출처 URL과 다르다: {art_id}"
        assert item.findtext("title") == (matched.get("title_ko") or matched["title"])
        pub_date = item.findtext("pubDate")
        if matched.get("date_precision") == "day":
            assert pub_date is None, f"date_precision=day인 기사({art_id})에 pubDate가 지어내졌다."
        elif matched.get("date_precision") == "time":
            assert parsedate_to_datetime(pub_date) == datetime.fromisoformat(matched["published_at"])

    # RSS 발견(discovery) 링크: 홈페이지 <head>에 alternate 태그가 있어야 한다.
    home, _ = fetch_raw(base_url, "/", timeout)
    assert 'application/rss+xml' in home and 'feed.xml' in home, "홈페이지에 RSS discovery 링크가 없다."


# ---- extract_full_text_data: 자동 원문 발췌+번역 (가짜 HTML, 네트워크/번역만 모킹) ----

def _fake_translate(text: str) -> str:
    return f"한국어 번역: {text}"


_HTML_SHORT = """
<html><body><article>
<p>The research team measured machine intelligence gains across several technology companies last year.</p>
<p>Machine intelligence and institutional capacity together determine how quickly new technology ideas become real products.</p>
<p>Institutional capacity often limits how fast machine intelligence can turn research ideas into working technology.</p>
</article></body></html>
"""

_P1_LONG = (
    "The extensive research initiative evaluated how growing machine intelligence capabilities interact with "
    "institutional capacity constraints across many different scientific and engineering fields over several recent decades."
)
_P2_LONG = (
    "Many engineering teams found that institutional capacity constraints limited how quickly machine intelligence "
    "breakthroughs could be turned into working technology across large and complex international organizations."
)
_P3_LONG = (
    "Across many organizations, institutional capacity and machine intelligence capabilities had to grow together "
    "before engineering teams could turn research breakthroughs into real deployed commercial technology products."
)
_P4_SHORT_UNRELATED = "Many small teams quietly adopted newer digital tools during this particular season."

_HTML_QUOTE_FAIL = f"""
<html><body><article>
<p>{_P1_LONG}</p>
<p>{_P2_LONG}</p>
<p>{_P3_LONG}</p>
<p>{_P4_SHORT_UNRELATED}</p>
</article></body></html>
"""


def check_extract_full_text_data_excerpt_success() -> None:
    with mock.patch.object(collect_content, "translate_to_korean", side_effect=_fake_translate):
        data = collect_content.extract_full_text_data(
            "https://example.com/a", "example-source", prefetched_html=_HTML_SHORT
        )
    assert data["summary_lines"] and len(data["summary_lines"]) == 3, "짧은 문장 3개로 요약이 만들어지지 않았다."
    excerpt = data["excerpt"]
    assert excerpt is not None, "<=25단어 완전한 문장이 있는데 excerpt가 비어 있다."
    assert len(excerpt["original"].split()) <= 25, "excerpt.original이 25단어를 초과한다."
    assert excerpt["original"] in (
        "The research team measured machine intelligence gains across several technology companies last year.",
        "Machine intelligence and institutional capacity together determine how quickly new technology ideas become real products.",
        "Institutional capacity often limits how fast machine intelligence can turn research ideas into working technology.",
    ), "excerpt.original이 원문 문장을 그대로 쓰지 않고 잘라내거나 바꿨다."
    assert data["excerpt_error"] is None
    with mock.patch.object(collect_content, "translate_to_korean", side_effect=_fake_translate):
        short = collect_content.extract_full_text_data(
            "https://example.com/short", "example-source",
            prefetched_html=f"<article><p>{_P4_SHORT_UNRELATED}</p></article>",
        )
    assert short["summary_lines"] is None and short["excerpt"]["original"] == _P4_SHORT_UNRELATED

    def fail_last_summary_sentence(text: str) -> str:
        if text.startswith("Institutional capacity often"):
            raise RuntimeError("번역 실패")
        return _fake_translate(text)

    with mock.patch.object(collect_content, "translate_to_korean", side_effect=fail_last_summary_sentence):
        partial = collect_content.extract_full_text_data(
            "https://example.com/partial", "example-source", prefetched_html=_HTML_SHORT,
        )
    assert partial["summary_lines"] is None and partial["excerpt"], "요약 번역 실패가 성공 가능한 발췌를 막았다."


def check_extract_full_text_data_long_excluded_and_quote_failure_visible() -> None:
    calls = []

    def translate_side_effect(text: str) -> str:
        calls.append(text)
        if text == _P4_SHORT_UNRELATED:
            raise RuntimeError("translation backend unavailable")
        return _fake_translate(text)

    with mock.patch.object(collect_content, "translate_to_korean", side_effect=translate_side_effect):
        data = collect_content.extract_full_text_data(
            "https://example.com/b", "example-source", prefetched_html=_HTML_QUOTE_FAIL
        )
    # 25단어 넘는 긴 문장은 선택되지 않고(잘리지도 않고), 번역 실패로 excerpt가 비어야 한다.
    assert data["excerpt"] is None, "25단어 초과 문장이 excerpt로 선택되었거나 잘못 잘렸다."
    assert data["excerpt_error"], "번역 실패 사유가 기록되지 않았다."
    assert "번역하지 못했습니다" in data["excerpt_error"]
    # 요약(3문장)은 인용 실패와 무관하게 성공해야 한다.
    assert data["summary_lines"] and len(data["summary_lines"]) == 3, "선택적 인용 실패가 성공한 요약까지 지워버렸다."
    with mock.patch.object(collect_content, "translate_to_korean", side_effect=_fake_translate):
        long_only = collect_content.extract_full_text_data(
            "https://example.com/long", "example-source",
            prefetched_html=_HTML_QUOTE_FAIL.replace(f"<p>{_P4_SHORT_UNRELATED}</p>", ""),
        )
    assert long_only["summary_lines"] and long_only["excerpt"] is None
    assert "25단어" in long_only["excerpt_error"], "너무 긴 문장을 잘라 인용하거나 실패 사유를 잃었다."


def check_extract_full_text_data_prefetched_skips_fetch() -> None:
    with mock.patch.object(collect_content, "translate_to_korean", side_effect=_fake_translate), \
         mock.patch.object(collect_content, "fetch_url", side_effect=AssertionError("prefetched_html이 있는데 fetch_url을 호출했다")):
        data = collect_content.extract_full_text_data(
            "https://example.com/a", "example-source", prefetched_html=_HTML_SHORT
        )
    assert data["summary_lines"], "prefetched_html 경로에서 요약이 만들어지지 않았다."


def check_extract_full_text_data_body_fetch_failure_visible() -> None:
    with mock.patch.object(collect_content, "registered_hosts_for_source", return_value=frozenset({"example.com"})), \
         mock.patch.object(collect_content, "fetch_url", side_effect=RuntimeError("HTTP 403: Forbidden")):
        data = collect_content.extract_full_text_data("https://example.com/c", "example-source")
    assert data["summary_lines"] is None
    assert data["excerpt"] is None
    assert data["excerpt_error"] and "403" in data["excerpt_error"], "본문 접근 실패(HTTP 403)가 사유에 드러나지 않았다."


def check_official_and_external_callers_persist_excerpt_fields() -> None:
    fake_success = {
        "summary_lines": ["요약1", "요약2", "요약3"],
        "excerpt": {"original": "A short complete sentence under the limit.", "ko": "[KO] 문장"},
        "excerpt_error": None,
    }
    fake_failure = {"summary_lines": None, "excerpt": None, "excerpt_error": "본문을 찾지 못함"}

    with mock.patch.object(collect_content, "extract_full_text_data", return_value=fake_success):
        candidate = collect_content.make_candidate(
            "제목", "example-source", "출처", "https://example.com/d", "원문 요약", {"published_on": "2026-10-02", "date_precision": "day"},
        )
    assert candidate.get("source_excerpt") == fake_success["excerpt"], "공식 수집(make_candidate)이 source_excerpt를 저장하지 않았다."
    assert "source_excerpt_error" not in candidate

    with mock.patch.object(collect_content, "extract_full_text_data", return_value=fake_failure):
        candidate2 = collect_content.make_candidate(
            "제목2", "example-source", "출처", "https://example.com/e", "원문 요약2", {"published_on": "2026-10-02", "date_precision": "day"},
        )
    assert "source_excerpt" not in candidate2
    assert candidate2.get("source_excerpt_error") == fake_failure["excerpt_error"]
    # RSS 요약이 있으면 본문 발췌 실패가 기사 게시 자체를 막지 않는다.
    assert candidate2.get("source_summary") == "원문 요약2"

    event = {
        "sources": [{
            "independent": True, "source_id": "example-source", "name": "출처", "url": "https://example.com/f",
            "target_url": "https://example.com/f", "title": "외부 제목", "summary": "외부 요약",
            "published_at": datetime.now(timezone.utc).isoformat(), "date_precision": "time",
        }],
    }
    with mock.patch.object(collect_hourly_news, "extract_full_text_data", return_value=fake_success), \
         mock.patch.object(collect_hourly_news, "needs_korean_translation", return_value=False):
        article = collect_hourly_news.build_article(event, count=2, high_at=3, now=datetime.now(timezone.utc))
    assert article.get("source_excerpt") == fake_success["excerpt"], "외부 수집(build_article)이 source_excerpt를 저장하지 않았다."

    with mock.patch.object(collect_hourly_news, "extract_full_text_data", return_value=fake_failure), \
         mock.patch.object(collect_hourly_news, "needs_korean_translation", return_value=False):
        article2 = collect_hourly_news.build_article(event, count=2, high_at=3, now=datetime.now(timezone.utc))
    assert article2.get("source_excerpt_error") == fake_failure["excerpt_error"]
    assert article2.get("source_summary") == "외부 요약", "본문 발췌 실패가 유효한 RSS 기사 게시를 막았다."


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default=None, help="점검할 서버 주소 (예: http://localhost:3000)")
    parser.add_argument("--timeout", type=float, default=15, help="요청별 제한 시간(초)")
    args = parser.parse_args()

    check_apply_reviewed_edition()
    check_editorial_links_resolve()
    print("[OK] apply_reviewed_edition, 용어집 링크 무결성 점검 통과")

    check_extract_full_text_data_excerpt_success()
    check_extract_full_text_data_long_excluded_and_quote_failure_visible()
    check_extract_full_text_data_prefetched_skips_fetch()
    check_extract_full_text_data_body_fetch_failure_visible()
    check_official_and_external_callers_persist_excerpt_fields()
    print("[OK] 자동 원문 발췌·번역(source_excerpt) 점검 통과")

    if args.base_url:
        base_url = normalize_base_url(args.base_url)
        today_path = ROOT / "data" / "today.json"
        today = read_json(today_path) if today_path.exists() else {"articles": []}
        articles = get_non_release_articles(today)
        try:
            check_today_page(base_url, args.timeout, articles)
            check_article_detail(base_url, args.timeout, articles)
            check_rss_feed(base_url, args.timeout, articles)
        except (OSError, UnicodeError, urllib.error.URLError, ET.ParseError, RuntimeError, AssertionError) as error:
            print(f"[FAIL] {error}", file=sys.stderr)
            sys.exit(1)
        print(f"[OK] {base_url} 의 /today, 기사 상세, /feed.xml 점검 통과 ({len(articles)}건 기사 기준)")
    else:
        print("--base-url이 없어 실행 중인 서버 점검은 건너뛴다 (로컬 데이터/로직 점검만 수행).")

    print("check_news_features: 모든 점검 통과")


if __name__ == "__main__":
    main()
