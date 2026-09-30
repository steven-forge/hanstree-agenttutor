#!/usr/bin/env python3
"""외부 AI 매체를 매시간 수집해 같은 사건으로 묶고, 독립 출처 2곳 이상이면 data/today.json에 자동 게시한다.

출처 목록·조건은 data/news-sources.json 한 파일에 둔다. 후보(독립 출처 부족·커뮤니티 신호뿐)는
data/today-candidates.json의 events에 남기고, 기존 게시 사건에 새 출처가 붙으면 새 글 없이 출처·중요도만 갱신한다.
"""

import argparse
import base64
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.parse
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_content import (  # noqa: E402
    CANDIDATES_PATH, DATA_DIR, HEALTH_PATH, KST, RELEASE_SOURCE_IDS, ROOT, SUMMARY_MAX, TODAY_PATH,
    build_beginner_explanation, build_full_text_summary_ko, canonicalize_url, classify_date, clean_html_text,
    fetch_url, merge_archive, merge_source_reports, needs_korean_translation, new_stats, news_status, parse_iso,
    read_json, translate_to_korean, url_id, validate_url, write_json,
)

SOURCES_PATH = DATA_DIR / "news-sources.json"
LOCK_PATH = ROOT / ".source-cache" / "news-hourly.lock"
LOCK_STALE_SEC = 30 * 60
STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "from", "as", "is", "are",
    "was", "be", "its", "it", "this", "that", "here", "how", "why", "what", "new", "now", "your", "you", "we",
    "can", "will", "has", "have", "into", "than", "more", "about", "after", "over", "up", "out", "not", "just",
    "says", "said", "gets", "get", "vs", "via",
    "ai", "agent", "agents", "app", "apps", "code", "model", "models", "open", "source", "sources",
    "announce", "announces", "launch", "launches", "release", "releases",
}
TOKEN_STEMS = {
    "blocked": "block", "blocking": "block", "blocks": "block",
    "launched": "launch", "launching": "launch", "launches": "launch",
    "patched": "patch", "patches": "patch", "shuts": "shut",
}


# ---------- 잠금 ----------

def acquire_lock() -> bool:
    """실행 단위 잠금. 충돌이면 False를 돌려주고 호출자는 데이터를 건드리지 않고 끝낸다."""
    LOCK_PATH.parent.mkdir(parents=True, exist_ok=True)
    try:
        # ponytail: 30분 넘은 잠금은 죽은 실행으로 보고 치운다. 검사와 생성 사이의 경합은 CI concurrency가 막는다.
        if LOCK_PATH.exists() and time.time() - LOCK_PATH.stat().st_mtime > LOCK_STALE_SEC:
            LOCK_PATH.unlink()
        fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w") as file:
        file.write(f"{os.getpid()} {datetime.now(KST).isoformat(timespec='seconds')}\n")
    return True


def release_lock() -> None:
    try:
        LOCK_PATH.unlink()
    except FileNotFoundError:
        pass


# ---------- 사건 병합 규칙 ----------

def registered_domain(url: str) -> str:
    # ponytail: 마지막 두 라벨만 본다(co.uk 같은 2단계 공용 접미사는 미구분). 필요해지면 접미사 목록을 둔다.
    host = (urllib.parse.urlsplit(url).hostname or "").lower()
    return ".".join(host.split(".")[-2:])


def title_tokens(title: str) -> set[str]:
    tokens = {t for t in re.split(r"[^a-z0-9]+", title.lower()) if len(t) >= 2 and t not in STOPWORDS}
    return {TOKEN_STEMS.get(token, token) for token in tokens}


MODEL_VERSION_RE = re.compile(r"\b(?:(?:claude\s+)?(opus|sonnet|haiku)|(gpt|gemini|grok|claude))[\s-]+(\d+(?:[.-]\d+)*)\b", re.I)
LAUNCH_VERB_RE = re.compile(r"\b(?:introduc\w*|announc\w*|launch\w*|releas\w*|unveil\w*|debut\w*|arriv\w*|is here|now available)\b", re.I)
OTHER_EVENT_RE = re.compile(r"\b(?:patch\w*|updat\w*|fix\w*|review\w*|analys\w*|benchmark\w*|vs\.?|versus)\b", re.I)
LAUNCH_STAGE_RE = re.compile(r"\b(?:beta|preview\w*|early access|general availability|ga|bedrock|vertex|azure)\b", re.I)


def model_ids(title: str) -> set[tuple[str, str]]:
    return {(family or other, version.replace("-", ".")) for family, other, version in MODEL_VERSION_RE.findall(title)}


def is_launch_title(title: str) -> bool:
    return bool(LAUNCH_VERB_RE.search(title) and not OTHER_EVENT_RE.search(title))


def event_key(title: str) -> set[str]:
    """고유명사·숫자 토큰(대문자 시작 또는 숫자 포함)을 사건 키로 쓴다. 2개 미만이면 전체 토큰."""
    salient = set()
    for word in re.findall(r"[A-Za-z0-9][\w.'-]*", title):
        if word[0].isupper() or any(c.isdigit() for c in word):
            salient |= title_tokens(word)
    return salient if len(salient) >= 2 else title_tokens(title)


def same_event(title_a: str, title_b: str) -> bool:
    # ponytail: 서로 다른 사건의 같은 제품 기사는 합치지 않는다. 짧게 표현된 동일 사건은 후보로 남을 수 있다.
    models_a, models_b = model_ids(title_a), model_ids(title_b)
    if models_a and models_b:
        if models_a != models_b or is_launch_title(title_a) != is_launch_title(title_b):
            return False
        if {s.lower() for s in LAUNCH_STAGE_RE.findall(title_a)} != {s.lower() for s in LAUNCH_STAGE_RE.findall(title_b)}:
            return False
        if len(models_a) == 1 and is_launch_title(title_a):
            return True
    if len(event_key(title_a) & event_key(title_b)) < 2:
        return False
    tokens_a, tokens_b = title_tokens(title_a), title_tokens(title_b)
    shared = tokens_a & tokens_b
    return len(shared) >= 3 and len(shared) / max(1, min(len(tokens_a), len(tokens_b))) >= 0.5


def independent_count(sources: list[dict]) -> int:
    """같은 최종 도메인의 재인용과 커뮤니티·소셜 출처는 독립 출처로 세지 않는다."""
    return len({registered_domain(s.get("target_url") or s["url"]) for s in sources if s.get("independent")})


def importance_for(count: int, high_at: int) -> str:
    return "high" if count >= high_at else "normal"


def merged_importance(previous: str, count: int, high_at: int) -> str:
    """공식 발표가 부여한 high는 이후 독립 출처 수 재계산으로 낮아지지 않는다."""
    return "high" if previous == "high" or importance_for(count, high_at) == "high" else "normal"


def public_source(item: dict) -> dict:
    out = {"source_id": item["source_id"], "name": item["source_name"], "url": item["url"], "independent": bool(item["independent"])}
    if item.get("target_url") and item["target_url"] != item["url"]:
        out["target_url"] = item["target_url"]
    return out


def has_source(sources: list[dict], item: dict) -> bool:
    return any(s.get("source_id") == item["source_id"] and s.get("url") == item["url"] for s in sources)


def source_urls(sources: list[dict]) -> set[str]:
    return {u for s in sources for u in (s.get("url"), s.get("target_url")) if u}


def article_sources(article: dict) -> list[dict]:
    if not isinstance(article.get("sources"), list):
        article["sources"] = [{"source_id": article.get("source_id", ""), "name": article.get("source_name", ""), "url": article.get("source_url", ""), "independent": False}]
    return article["sources"]


def matches_event(title: str, event: dict) -> bool:
    """대표 제목뿐 아니라 사건에 묶인 각 출처 제목도 비교한다."""
    titles = [str(event.get("title") or "")]
    titles.extend(str(s.get("title") or "") for s in event.get("sources") or [])
    return any(candidate and same_event(title, candidate) for candidate in titles)


def rebuild_events(stored_events: list[dict], now: datetime) -> list[dict]:
    """병합 규칙이 바뀌어도 오래된 오분류 후보가 남지 않도록 출처 단위로 다시 묶는다."""
    events: list[dict] = []
    for old in stored_events:
        for source in old.get("sources") or []:
            if not source.get("title") or not source.get("url"):
                continue
            event = next((candidate for candidate in events if matches_event(source["title"], candidate)), None)
            if event is None:
                event = {
                    "id": url_id(source.get("target_url") or source["url"]),
                    "title": source["title"],
                    "first_seen": old.get("first_seen") or now.isoformat(timespec="seconds"),
                    "sources": [],
                }
                events.append(event)
            if not has_source(event["sources"], source):
                event["sources"].append(source)
    return events


def article_datetime(article: dict) -> datetime | None:
    if article.get("published_at"):
        return parse_iso(article["published_at"])
    if article.get("published_on"):
        try:
            return datetime.strptime(article["published_on"], "%Y-%m-%d").replace(tzinfo=KST)
        except ValueError:
            return None
    return None


# ---------- 피드·API 읽기 ----------

def _local(tag) -> str:
    return str(tag).rsplit("}", 1)[-1].lower()


def _child_text(el, *names) -> str:
    for name in names:
        for child in el:
            if _local(child.tag) == name and (child.text or "").strip():
                return child.text.strip()
    return ""


def _entry_link(el) -> str:
    for child in el:
        if _local(child.tag) != "link":
            continue
        href = (child.get("href") or "").strip()
        if href and child.get("rel", "alternate") == "alternate":
            return href
        if not href and (child.text or "").strip():
            return child.text.strip()
    return ""


def parse_feed_date(text: str) -> datetime | None:
    if not text:
        return None
    dt = parse_iso(text)
    if dt is None:
        try:
            dt = parsedate_to_datetime(text)
        except Exception:
            return None
    return dt


def parse_feed(xml_bytes: bytes) -> list[dict]:
    """RSS 2.0·RSS 1.0·Atom 항목을 {title,url,date,summary}로 통일한다. 날짜는 RFC 2822·ISO 8601 모두 받는다."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as error:
        raise RuntimeError(f"피드 XML 파싱 실패: {error}")
    entries = [el for el in root.iter() if _local(el.tag) in ("item", "entry")]
    if not entries:
        raise RuntimeError("피드 항목이 없습니다. 빈 수집 성공으로 처리하지 않습니다.")
    return [{
        "title": clean_html_text(_child_text(el, "title")),
        "url": _entry_link(el),
        "date": parse_feed_date(_child_text(el, "pubdate", "published", "updated", "date")),
        "summary": clean_html_text(_child_text(el, "description", "summary", "content", "encoded"))[:SUMMARY_MAX],
    } for el in entries]


def fetch_json(url: str, hosts: set, headers: dict = None, data: bytes = None):
    status, _, body = fetch_url(url, allowed_hosts=hosts, extra_headers=headers, data=data)
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {url}")
    return json.loads(body.decode("utf-8"))


def fetch_feed_items(sdef: dict, hosts: set) -> list[dict]:
    status, _, body = fetch_url(sdef["url"], allowed_hosts=hosts)
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {sdef['url']}")
    return parse_feed(body)


def fetch_hn_items(sdef: dict, hosts: set) -> list[dict]:
    ids = fetch_json(sdef["url"], hosts)
    if not isinstance(ids, list) or not ids:
        raise RuntimeError("Hacker News 목록이 비어 있습니다.")
    items = []
    for story_id in ids[: int(sdef.get("max_items", 30))]:
        try:
            story = fetch_json(f"https://hacker-news.firebaseio.com/v0/item/{int(story_id)}.json", hosts)
        except Exception:
            items.append({"title": "", "url": "", "date": None, "summary": ""})  # 개별 실패는 보류로 센다
            continue
        if not isinstance(story, dict) or story.get("type") != "story" or not story.get("url"):
            continue
        items.append({
            "title": story.get("title") or "",
            "url": f"https://news.ycombinator.com/item?id={int(story_id)}",
            "target_url": story["url"],
            "date": datetime.fromtimestamp(int(story["time"]), tz=timezone.utc) if story.get("time") else None,
            "summary": "",
        })
    return items


# 소셜 3종은 공식 API만 쓰고 인증값은 헤더로만 보낸다. ponytail: 실제 API 응답으로 검증하지 못함. 형식이 다르면 해당 출처만 failed로 기록된다.
def fetch_youtube_items(sdef: dict, hosts: set) -> list[dict]:
    query = urllib.parse.urlencode({"part": "snippet", "type": "video", "order": "date", "maxResults": int(sdef.get("max_items", 10)), "q": sdef.get("query", "AI")})
    payload = fetch_json(f"{sdef['url']}?{query}", hosts, headers={"X-Goog-Api-Key": os.environ["YOUTUBE_API_KEY"]})
    return [{
        "title": it["snippet"].get("title", ""),
        "url": f"https://www.youtube.com/watch?v={it['id']['videoId']}",
        "date": parse_iso(it["snippet"].get("publishedAt")),
        "summary": it["snippet"].get("description", ""),
    } for it in payload.get("items", []) if isinstance(it.get("id"), dict) and it["id"].get("videoId")]


def fetch_reddit_items(sdef: dict, hosts: set) -> list[dict]:
    creds = base64.b64encode(f"{os.environ['REDDIT_CLIENT_ID']}:{os.environ['REDDIT_CLIENT_SECRET']}".encode()).decode()
    token = fetch_json("https://www.reddit.com/api/v1/access_token", hosts, headers={"Authorization": f"Basic {creds}"}, data=b"grant_type=client_credentials").get("access_token")
    if not token:
        raise RuntimeError("Reddit 접근 토큰을 받지 못했습니다.")
    payload = fetch_json(f"{sdef['url']}?limit={int(sdef.get('max_items', 10))}", hosts, headers={"Authorization": f"Bearer {token}"})
    items = []
    for child in payload.get("data", {}).get("children", []):
        d = child.get("data") or {}
        items.append({
            "title": d.get("title", ""),
            "url": "https://www.reddit.com" + d.get("permalink", ""),
            "target_url": d.get("url") or None,
            "date": datetime.fromtimestamp(d["created_utc"], tz=timezone.utc) if d.get("created_utc") else None,
            "summary": d.get("selftext", ""),
        })
    return items


def fetch_x_items(sdef: dict, hosts: set) -> list[dict]:
    query = urllib.parse.urlencode({"query": sdef.get("query", "AI"), "max_results": max(10, int(sdef.get("max_items", 10))), "tweet.fields": "created_at,entities"})
    payload = fetch_json(f"{sdef['url']}?{query}", hosts, headers={"Authorization": f"Bearer {os.environ['X_BEARER_TOKEN']}"})
    items = []
    for tweet in payload.get("data", []):
        urls = [u.get("expanded_url") for u in (tweet.get("entities") or {}).get("urls", []) if u.get("expanded_url")]
        items.append({
            "title": clean_html_text(tweet.get("text", ""))[:200],
            "url": f"https://x.com/i/status/{tweet['id']}",
            "target_url": urls[0] if urls else None,
            "date": parse_iso(tweet.get("created_at")),
            "summary": "",
        })
    return items


FETCHERS = {"feed": fetch_feed_items, "hn_api": fetch_hn_items, "youtube_api": fetch_youtube_items, "reddit_api": fetch_reddit_items, "x_api": fetch_x_items}


def normalize_item(sdef: dict, raw: dict, window_start: datetime, window_end: datetime, stats: dict, keyword_re) -> dict | None:
    title, url, target = (raw.get("title") or "").strip(), (raw.get("url") or "").strip(), (raw.get("target_url") or raw.get("url") or "").strip()
    date = raw.get("date")
    if not title or not url or date is None or date.tzinfo is None:
        stats["held_count"] += 1
        return None
    try:
        validate_url(url, None)
        validate_url(target, None)
    except ValueError:
        stats["held_count"] += 1
        return None
    if sdef.get("keyword_filter") and keyword_re is not None and not keyword_re.search(f"{title} {raw.get('summary') or ''}"):
        stats["excluded_count"] += 1
        return None
    state, date_fields = classify_date(date, window_start, window_end)
    if state != "ok":
        stats["excluded_count"] += 1
        return None
    return {
        "source_id": sdef["id"], "source_name": sdef["name"], "independent": bool(sdef.get("independent")),
        "url": canonicalize_url(url), "target_url": canonicalize_url(target),
        "title": title, "summary": (raw.get("summary") or "")[:SUMMARY_MAX], **date_fields,
    }


# ---------- 게시 ----------

def build_article(event: dict, count: int, high_at: int, now: datetime) -> dict:
    """번역·요약·날짜 중 하나라도 빠지면 예외를 던져 후보로 남긴다. 원문 밖의 사실은 만들지 않는다."""
    primary = next(s for s in event["sources"] if s.get("independent"))
    summary = (primary.get("summary") or next((s.get("summary") for s in event["sources"] if s.get("summary")), "")).strip()[:SUMMARY_MAX]
    if not summary:
        raise RuntimeError("출처 요약이 없어 짧은 한국어 요약을 만들 수 없습니다.")
    date_fields = {k: primary[k] for k in ("published_at", "published_on", "date_precision") if k in primary}
    if not date_fields:
        raise RuntimeError("발행 시각이 없습니다.")
    article = {
        "id": url_id(primary["url"]),
        "title": primary["title"],
        "source_id": primary["source_id"], "source_name": primary["name"], "source_url": primary["url"],
        "source_summary": summary,
        "why_it_matters": build_beginner_explanation(primary["title"], primary["source_id"], summary),
        "why_it_matters_provenance": "automatic",
        "fetched_at": now.isoformat(timespec="seconds"),
        **date_fields,
        "importance": importance_for(count, high_at),
        "independent_source_count": count,
        "sources": [public_source_from_event(s) for s in event["sources"]],
    }
    if needs_korean_translation(article["title"]):
        article["title_ko"] = translate_to_korean(article["title"])
    if needs_korean_translation(summary):
        article["source_summary_ko"] = translate_to_korean(summary)
    full_summary = build_full_text_summary_ko(primary["url"], primary["source_id"])
    if full_summary:
        article["source_summary_ko"] = full_summary
        article["source_summary_provenance"] = "article_full_text_3line"
    return article


def public_source_from_event(s: dict) -> dict:
    return public_source({"source_id": s["source_id"], "source_name": s["name"], "url": s["url"], "target_url": s.get("target_url"), "independent": s.get("independent")})


def event_source(item: dict) -> dict:
    return {"source_id": item["source_id"], "name": item["source_name"], "url": item["url"], "target_url": item["target_url"], "independent": item["independent"],
            "title": item["title"], "summary": item["summary"], **{k: item[k] for k in ("published_at", "published_on", "date_precision") if k in item}}


def collect_hourly() -> int:
    config = read_json(SOURCES_PATH)
    sources = [s for s in config.get("sources", []) if isinstance(s, dict) and s.get("enabled", True)]
    if not sources:
        raise ValueError("data/news-sources.json에 사용할 출처가 없습니다.")
    now = datetime.now(KST)
    window_hours = int(config.get("window_hours", 72))
    window_start, window_end = now - timedelta(hours=window_hours), now
    publish_cfg = config.get("publish") or {}
    min_independent, high_at = int(publish_cfg.get("min_independent", 2)), int(publish_cfg.get("high_importance_at", 3))
    keywords = [k for k in config.get("ai_keywords", []) if k]
    keyword_re = re.compile(r"\b(?:" + "|".join(re.escape(k) for k in keywords) + r")\b", re.I) if keywords else None

    today = {"edition_date": None, "window_start": None, "window_end": None, "collected_at": None, "reviewed_at": None, "articles": [], **read_json(TODAY_PATH)}
    if not isinstance(today["articles"], list):
        raise ValueError("data/today.json의 articles가 배열이 아닙니다. 공개 archive를 보호하기 위해 중단합니다.")
    candidates_data = read_json(CANDIDATES_PATH)
    stored_events = [e for e in candidates_data.get("events") or [] if isinstance(e, dict) and isinstance(e.get("sources"), list) and e.get("title")]
    events = rebuild_events(stored_events, now)

    # URL 색인: 이미 어떤 사건에 속한 링크는 다시 사건을 만들지 않는다.
    known: dict[str, tuple[str, dict]] = {}
    recent_articles = []
    for article in today["articles"]:
        if not isinstance(article, dict) or article.get("source_id") in RELEASE_SOURCE_IDS:
            continue
        urls = source_urls(article.get("sources") or [])
        if isinstance(article.get("source_url"), str):
            urls.add(canonicalize_url(article["source_url"]))
        for u in urls:
            known[u] = ("article", article)
        published = article_datetime(article)
        if published is not None and published >= window_start - timedelta(hours=window_hours):
            recent_articles.append(article)
    for event in events:
        for u in source_urls(event["sources"]):
            known[u] = ("event", event)

    reports, items = [], []
    for sdef in sources:
        stats, collected, error = new_stats(), [], None
        not_configured_reason = sdef.get("not_configured_reason") or (
            f"필요한 환경 변수 없음: {', '.join(v for v in sdef.get('required_env', []) if not os.environ.get(v))}"
            if [v for v in sdef.get("required_env", []) if not os.environ.get(v)] else None
        )
        if not_configured_reason:
            status = "not_configured"
        else:
            try:
                fetcher = FETCHERS.get(sdef.get("type"))
                if fetcher is None:
                    raise RuntimeError(f"지원하지 않는 출처 type: {sdef.get('type')}")
                for raw in fetcher(sdef, set(sdef.get("hosts") or []))[: int(sdef.get("max_items", 30))]:
                    item = normalize_item(sdef, raw, window_start, window_end, stats, keyword_re)
                    if item:
                        collected.append(item)
            except Exception as err:
                error = str(err)
            status = "failed" if error else "partial" if stats["held_count"] > 0 else "ok"
        report = {"id": sdef["id"], "name": sdef["name"], "url": sdef["url"], "status": status, "count": len(collected), "checked_at": now.isoformat(), **stats}
        if not_configured_reason:
            report["error"] = not_configured_reason
        elif error:
            report["error"] = error
        reports.append(report)
        items.extend(collected)

    report_by_id = {r["id"]: r for r in reports}
    updated_articles = 0
    for item in items:
        hit = known.get(item["target_url"]) or known.get(item["url"])
        if hit is None:
            for kind, pool in (("article", recent_articles), ("event", events)):
                match = next((obj for obj in pool if matches_event(item["title"], obj)), None)
                if match is not None:
                    hit = (kind, match)
                    break
        if hit is None:
            event = {"id": url_id(item["target_url"]), "title": item["title"], "first_seen": now.isoformat(timespec="seconds"), "sources": [event_source(item)]}
            events.append(event)
            hit = ("event", event)
        else:
            kind, obj = hit
            sources_list = article_sources(obj) if kind == "article" else obj["sources"]
            if has_source(sources_list, item):
                report_by_id[item["source_id"]]["skipped_count"] += 1
                continue
            sources_list.append(public_source(item) if kind == "article" else event_source(item))
            if kind == "article":
                count = independent_count(sources_list)
                obj["independent_source_count"], obj["importance"] = count, merged_importance(obj.get("importance"), count, high_at)
                updated_articles += 1
        for u in (item["url"], item["target_url"]):
            known[u] = hit

    # 먼저 후보가 된 출처도 이후 게시된 같은 사건이 있으면 새 글을 만들지 않고 기존 기사에 합친다.
    pending_events = []
    for event in events:
        article = next((a for a in recent_articles if matches_event(str(a.get("title") or ""), event)), None)
        if article is None:
            pending_events.append(event)
            continue
        sources_list = article_sources(article)
        changed = False
        for source in event["sources"]:
            if not has_source(sources_list, source):
                sources_list.append(public_source_from_event(source))
                changed = True
        if changed:
            count = independent_count(sources_list)
            article["independent_source_count"], article["importance"] = count, merged_importance(article.get("importance"), count, high_at)
            updated_articles += 1
    events = pending_events

    date_filtered_events = []
    for event in events:
        dates = [d for d in (article_datetime(s) for s in event["sources"]) if d is not None]
        if not dates or max(dates) < window_start:
            continue  # 창을 벗어난 후보는 버린다. 피드에 다시 나타나면 다시 후보가 된다.
        date_filtered_events.append(event)

    new_articles, remaining = [], []
    eligible_count = waiting_count = held_count = 0
    for event in date_filtered_events:
        count = independent_count(event["sources"])
        event["independent_source_count"] = count
        if count >= min_independent:
            eligible_count += 1
            try:
                new_articles.append(build_article(event, count, high_at, now))
                continue
            except Exception as err:
                event["status"], event["reason"] = "held", f"자동 게시 보류: {err}"
                held_count += 1
        else:
            event["status"], event["reason"] = "candidate", "독립 출처 부족" if count else "커뮤니티·소셜 신호만 있음"
            waiting_count += 1
        remaining.append(event)

    added, merged_changed = merge_archive(today, new_articles)
    if merged_changed or updated_articles:
        today.update(edition_date=now.strftime("%Y-%m-%d"), collected_at=now.isoformat())
        write_json(TODAY_PATH, today)

    hourly_run = {
        "collected_at": now.isoformat(),
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "candidate_count": len(date_filtered_events),
        "eligible_count": eligible_count,
        "published_count": len(added),
        "waiting_count": waiting_count,
        "held_count": held_count,
        "duplicate_count": len(new_articles) - len(added),
        "held_item_count": sum(r["held_count"] for r in reports),
        "failed_source_count": sum(1 for r in reports if r["status"] == "failed"),
        "checked_source_count": sum(1 for r in reports if r["status"] != "not_configured"),
        "not_configured_source_count": sum(1 for r in reports if r["status"] == "not_configured"),
        "min_independent": min_independent,
    }

    candidates_data.update(
        hourly_collected_at=now.isoformat(),
        hourly_window_start=window_start.isoformat(),
        sources=merge_source_reports(candidates_data.get("sources") or [], reports),
        events=remaining,
        auto_published_count=len(added),
        hourly_run=hourly_run,
    )
    write_json(CANDIDATES_PATH, candidates_data)

    health = read_json(HEALTH_PATH)
    news = health.get("news") or {}
    merged_sources = merge_source_reports(news.get("sources") or [], reports)
    health["news"] = {**news, "checked_at": now.isoformat(), "status": news_status(merged_sources), "archive_count": len(today["articles"]),
                      "pending_event_count": len(remaining), "sources": merged_sources}
    health.setdefault("documents", {"checked_at": None, "sources": []})
    write_json(HEALTH_PATH, health)

    own_status = news_status(reports)
    print(f"[매시간 수집 완료] 상태: {own_status}, 자동 게시 {len(added)}건, 기존 기사 출처 갱신 {updated_articles}건, 후보 {len(remaining)}건")
    for r in reports:
        line = f"  - {r['name']}: {r['status']} (항목 {r['count']}건, 보류 {r['held_count']}건, 제외 {r['excluded_count']}건)"
        if "error" in r:
            line += f" [오류: {r['error']}]"
        print(line)
    return 1 if own_status == "failed" else 0


def self_check() -> None:
    """네트워크 없이 사건 병합·독립 출처 계산·피드 파싱 규칙만 확인한다."""
    assert same_event("OpenAI launches GPT-6 with new reasoning mode", "GPT-6 is here: what OpenAI's new model can do")
    assert not same_event("OpenAI launches GPT-6", "OpenAI launches new safety team")
    assert same_event("Anthropic Releases Claude 5 Agent SDK", "Anthropic's Claude 5 Agent SDK arrives for developers")
    assert same_event(
        "Anthropic launches Claude Opus 5.5 with stricter safeguards for cybersecurity",
        "Anthropic releases Opus 5.5 with lower prices and Fable-level performance",
    )
    assert not same_event(
        "Anthropic launches Claude Opus 5.5 with stricter safeguards for cybersecurity",
        "Claude Opus 5.5 vs. GPT-6 Sol: Cost per correct task, not price per token",
    )
    assert not same_event("Anthropic launches Claude Opus 5.5", "Anthropic patches Claude Opus 5.5")
    assert not same_event("Anthropic launches Claude Opus 5.5 beta", "Anthropic launches Claude Opus 5.5 general availability")
    assert merged_importance("high", 1, 3) == "high" and merged_importance("normal", 1, 3) == "normal"
    sources = [
        {"source_id": "techcrunch-ai", "url": "https://techcrunch.com/a", "independent": True},
        {"source_id": "hacker-news", "url": "https://news.ycombinator.com/item?id=1", "target_url": "https://techcrunch.com/a", "independent": False},
        {"source_id": "wired-ai", "url": "https://www.wired.com/story/a", "independent": True},
        {"source_id": "wired-ai", "url": "https://www.wired.com/story/b", "independent": True},
    ]
    assert independent_count(sources) == 2, "같은 도메인·커뮤니티 재인용은 독립 출처가 아니다"
    assert importance_for(2, 3) == "normal" and importance_for(3, 3) == "high"
    rss = b"""<rss><channel><item><title>A &amp; B</title><link>https://techcrunch.com/x</link>
        <pubDate>Tue, 22 Sep 2026 01:02:03 +0000</pubDate><description>&lt;p&gt;hi&lt;/p&gt;</description></item></channel></rss>"""
    atom = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>T</title><link rel="alternate" href="https://www.theverge.com/y"/>
        <published>2026-09-22T01:02:03Z</published><summary>s</summary></entry></feed>"""
    r, a = parse_feed(rss)[0], parse_feed(atom)[0]
    assert r["title"] == "A & B" and r["url"] == "https://techcrunch.com/x" and r["date"].tzinfo is not None and r["summary"] == "hi"
    assert a["url"] == "https://www.theverge.com/y" and a["date"].year == 2026
    try:
        parse_feed(b"<rss><channel></channel></rss>")
        assert False, "빈 피드는 실패여야 한다"
    except RuntimeError:
        pass
    stats = new_stats()
    now = datetime.now(KST)
    sdef = {"id": "wired-ai", "name": "WIRED", "independent": True, "keyword_filter": True}
    assert normalize_item(sdef, {"title": "Chip news", "url": "https://www.wired.com/z", "date": now, "summary": ""}, now - timedelta(hours=72), now, stats, re.compile(r"\bai\b", re.I)) is None
    assert stats["excluded_count"] == 1
    assert normalize_item(sdef, {"title": "AI chip", "url": "http://www.wired.com/z", "date": now, "summary": ""}, now - timedelta(hours=72), now, stats, None) is None and stats["held_count"] == 1
    print("self-check ok")


def main() -> None:
    parser = argparse.ArgumentParser(description="외부 AI 매체 매시간 수집·사건 병합·자동 게시")
    parser.add_argument("--self-check", action="store_true", help="네트워크 없이 병합·파싱 규칙만 확인합니다.")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        return
    if not acquire_lock():
        print(f"[매시간 수집 건너뜀] 다른 실행이 진행 중입니다 (잠금: {LOCK_PATH}). 데이터를 수정하지 않았습니다.")
        return
    try:
        sys.exit(collect_hourly())
    finally:
        release_lock()


if __name__ == "__main__":
    main()
