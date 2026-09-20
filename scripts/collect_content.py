#!/usr/bin/env python3
"""AgentTutor 뉴스 후보 및 학습 자료 출처 갱신 스크립트"""

import argparse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CANDIDATES_PATH = DATA_DIR / "today-candidates.json"
HEALTH_PATH = DATA_DIR / "content-health.json"
TODAY_PATH = DATA_DIR / "today.json"
SOURCE_CACHE_PATH = ROOT / ".source-cache" / "content.json"

KST = timezone(timedelta(hours=9))
TIMEOUT = 20
MAX_BYTES = 3 * 1024 * 1024  # 3MB
RELEASES_MAX_BYTES = 12 * 1024 * 1024  # Codex 30건 실측 약 10.5MB
WINDOW_DAYS = 60
SUMMARY_MAX = 500
# ponytail: 출처당 Releases API 최대 20페이지(600건); 60일 안에 넘치면 coverage_limited로 기록되고 상한을 올린다.
MAX_RELEASE_PAGES = 20
RELEASES_PER_PAGE = 30
PRERELEASE_RE = re.compile(r'(?i)\b(alpha|beta|rc|preview|nightly)\b|[.-](alpha|beta|rc|preview|nightly)')

ALLOWED_HOSTS = {
    "openai.com", "www.openai.com", "learn.chatgpt.com", "developers.openai.com",
    "anthropic.com", "www.anthropic.com", "code.claude.com", "platform.claude.com",
    "blog.google", "ai.google.dev", "developers.google.com", "gemini.google", "geminicli.com", "www.geminicli.com",
    "x.ai", "www.x.ai", "docs.x.ai",
    "agentskills.io", "www.agentskills.io",
    "modelcontextprotocol.io", "huggingface.co",
    "w3.org", "www.w3.org",
    "github.com", "api.github.com"
}
TRANSLATION_HOST = "api.mymemory.translated.net"


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary.replace(path)


class SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts=ALLOWED_HOSTS):
        super().__init__()
        self.allowed_hosts = allowed_hosts

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl, self.allowed_hosts)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate_url(url: str, allowed_hosts=ALLOWED_HOSTS) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError(f"HTTPS 프로토콜만 허용됩니다: {url}")
    if parsed.username or parsed.password:
        raise ValueError(f"사용자 인증 정보가 포함된 URL은 거부됩니다: {url}")
    if parsed.port and parsed.port != 443:
        raise ValueError(f"비정상 포트는 허용되지 않습니다: {url}")
    hostname = (parsed.hostname or "").lower()
    if hostname not in allowed_hosts:
        raise ValueError(f"허용되지 않은 호스트입니다: {hostname}")


KNOWN_TRACKING_PARAMS = {"ref", "source", "fbclid", "gclid", "yclid", "_ga", "mc_cid", "mc_eid"}


def canonicalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    q_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(k, v) for k, v in q_pairs if not (k.lower().startswith("utm_") or k.lower() in KNOWN_TRACKING_PARAMS)]
    new_query = urllib.parse.urlencode(filtered)
    path = parsed.path.rstrip("/") if parsed.path != "/" else "/"
    return urllib.parse.urlunsplit((parsed.scheme.lower(), (parsed.hostname or "").lower(), path, new_query, ""))


def fetch_url(url: str, etag: str = None, last_modified: str = None, max_retries: int = 2, max_bytes: int = MAX_BYTES, allowed_hosts=ALLOWED_HOSTS) -> tuple[int, dict, bytes]:
    validate_url(url, allowed_hosts)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; AgentTutor/0.2; +https://hanstree-agenttutor-jgwu.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/atom+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    opener = urllib.request.build_opener(SafeRedirectHandler(allowed_hosts))
    request = urllib.request.Request(url, headers=headers)

    attempts = 0
    while True:
        attempts += 1
        try:
            with opener.open(request, timeout=TIMEOUT) as response:
                status = response.status
                resp_headers = {k.lower(): v for k, v in response.headers.items()}
                body = response.read(max_bytes + 1)
                if len(body) > max_bytes:
                    raise ValueError(f"응답 크기가 최대 허용치({max_bytes // (1024 * 1024)}MB)를 초과했습니다: {url}")
                return status, resp_headers, body
        except urllib.error.HTTPError as error:
            resp_headers = {k.lower(): v for k, v in error.headers.items()} if error.headers else {}
            if error.code == 304:
                return 304, resp_headers, b""
            if error.code in (429, 500, 502, 503, 504) and attempts <= max_retries:
                retry_after = resp_headers.get("retry-after")
                wait_sec = 2.0
                if retry_after:
                    try:
                        wait_val = float(retry_after)
                    except ValueError:
                        try:
                            retry_dt = parsedate_to_datetime(retry_after)
                            if retry_dt.tzinfo is None:
                                retry_dt = retry_dt.replace(tzinfo=timezone.utc)
                            wait_val = (retry_dt - datetime.now(timezone.utc)).total_seconds()
                        except Exception:
                            wait_val = 2.0
                    if wait_val > 20.0:
                        raise RuntimeError(f"Retry-After 대기시간 초과 ({wait_val:.1f}초)")
                    wait_sec = max(wait_val, 1.0)
                time.sleep(wait_sec)
                continue
            raise RuntimeError(f"HTTP {error.code}: {error.reason}")
        except urllib.error.URLError as error:
            if attempts <= max_retries and "timed out" in str(error).lower():
                time.sleep(1.5)
                continue
            raise RuntimeError(f"네트워크 오류: {error.reason}")


def clean_html_text(raw_html: str) -> str:
    unescaped = html.unescape(raw_html or "")
    no_tags = re.sub(r"<[^>]+>", " ", unescaped)
    return re.sub(r"\s+", " ", no_tags).strip()


def needs_korean_translation(text: str) -> bool:
    return bool(re.search(r"[A-Za-z]", text or "")) and not bool(re.search(r"[가-힣]", text or ""))


def split_translation_chunks(text: str, max_bytes: int = 450) -> list[str]:
    """MyMemory의 요청당 500바이트 제한을 넘지 않게 문장·단어 경계에서 나눈다."""
    remaining = text.strip()
    chunks = []
    while remaining:
        end = min(len(remaining), max_bytes)
        while end > 1 and len(remaining[:end].encode("utf-8")) > max_bytes:
            end -= 1
        if end < len(remaining):
            boundary = max(remaining.rfind(". ", 0, end), remaining.rfind(" ", 0, end))
            if boundary > 0:
                end = boundary + (1 if remaining[boundary] == "." else 0)
        chunks.append(remaining[:end].strip())
        remaining = remaining[end:].strip()
    return [chunk for chunk in chunks if chunk]


def translate_to_korean(text: str) -> str:
    translated = []
    for chunk in split_translation_chunks(text):
        query = urllib.parse.urlencode({"q": chunk, "langpair": "en|ko", "mt": "1"})
        status, _, body = fetch_url(
            f"https://{TRANSLATION_HOST}/get?{query}",
            max_retries=1,
            allowed_hosts=ALLOWED_HOSTS | {TRANSLATION_HOST},
        )
        translated.append(translation_from_response(status, body))
    return " ".join(translated)


def translation_from_response(status: int, body: bytes) -> str:
    try:
        payload = json.loads(body.decode("utf-8"))
        value = html.unescape(payload["responseData"]["translatedText"]).strip()
    except (KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise RuntimeError(f"한국어 번역 응답을 읽을 수 없습니다: {error}")
    if status != 200 or payload.get("responseStatus") != 200 or not re.search(r"[가-힣]", value):
        raise RuntimeError("한국어 번역에 실패했습니다.")
    return value


def translated_release_title(title: str, source_id: str) -> str | None:
    if not re.fullmatch(r"(?i)(?:release\s+)?v?\d[\w.-]*", title.strip()):
        return None
    product = "Codex" if source_id == "codex-releases" else "Gemini CLI" if source_id == "gemini-releases" else None
    if not product:
        return None
    version = re.sub(r"(?i)^release\s+", "", title.strip())
    return f"{product} {version} 버전 출시"


def build_beginner_explanation(title: str, source_id: str, source_summary: str = "") -> str:
    """제목·공식 설명의 주제만 분류해 원문 밖의 사실을 만들지 않는 한국어 해설을 만든다."""
    if source_id in {"codex-releases", "gemini-releases"}:
        return "새 버전의 기능과 수정 사항은 개발 도구의 동작과 작업 안정성에 직접 영향을 줄 수 있습니다. 초보자는 업데이트 전에 변경 내역을 확인하면 기존 설정이나 작업 흐름이 달라지는 이유를 이해하기 쉽습니다."

    topics = [
        (("security", "safety", "secure", "cyber", "privacy", "risk", "scam", "protect", "trust"),
         "AI가 널리 쓰일수록 개인정보 보호, 악용 방지, 결과의 신뢰성이 제품 기능만큼 중요해집니다. 초보자는 새 기능을 사용할 때 권한 범위와 안전장치를 함께 확인해야 한다는 점을 보여주는 소식입니다."),
        (("policy", "government", "regulation", "law", "legal", "governance", "public sector"),
         "정부·기관의 AI 정책은 어떤 서비스를 어디서, 어떤 기준으로 사용할 수 있는지에 영향을 줍니다. 초보자는 기능뿐 아니라 적용 대상, 책임 범위, 이용 조건도 함께 살펴봐야 합니다."),
        (("health", "medical", "biology", "drug", "science", "research", "quantum", "math"),
         "AI가 의료·과학 연구에 쓰이면 분석과 실험을 빠르게 도울 수 있지만 결과 검증과 전문가 판단이 필요합니다. 초보자는 AI의 제안을 확정된 사실로 보지 말고 근거와 검토 절차를 함께 확인해야 합니다."),
        (("education", "student", "teacher", "learn", "youth", "teen", "children", "older adult"),
         "AI를 배우고 사용하는 사람이 넓어질수록 쉬운 교육과 연령에 맞는 보호 장치가 중요해집니다. 초보자는 사용법뿐 아니라 개인정보와 잘못된 답을 확인하는 방법도 함께 익혀야 합니다."),
        (("image", "video", "voice", "speech", "music", "film", "fashion", "creative", "design"),
         "텍스트를 넘어 이미지·영상·음성까지 AI로 다루는 범위가 넓어지고 있음을 보여줍니다. 초보자는 결과의 품질뿐 아니라 저작권, 출처 표시, 사람의 최종 검토도 함께 고려해야 합니다."),
        (("finance", "financial", "econom", "cost", "price", "business", "enterprise", "company", "customer", "workforce", "productivity", "ipo"),
         "이 사례는 AI가 실제 조직의 비용, 업무 속도, 의사결정 방식에 어떤 영향을 줄 수 있는지 보여줍니다. 초보자는 홍보 수치만 보기보다 적용 조건과 사람이 검토해야 할 지점을 함께 확인하는 것이 중요합니다."),
        (("model", "gpt", "claude", "gemini", "grok", "reasoning", "intelligence"),
         "새 AI 모델이나 성능 변화는 답변 품질, 속도, 비용, 사용할 수 있는 작업 범위에 영향을 줄 수 있습니다. 초보자는 이름이나 성능 주장만 비교하지 말고 자신의 용도에서 정확성과 제한 사항을 직접 확인해야 합니다."),
        (("agent", "api", "developer", "coding", "code", "workflow", "mcp", "tool", "automation"),
         "AI가 답변만 하는 도구에서 실제 작업을 수행하는 에이전트로 확장되는 흐름과 관련된 소식입니다. 초보자는 자동화 범위를 작게 시작하고 권한, 실행 결과, 실패 기록을 사람이 확인할 수 있게 해야 합니다."),
    ]
    for text in (title.lower(), source_summary.lower()):
        for keywords, explanation in topics:
            if any(keyword in text for keyword in keywords):
                return explanation
    return "이 공식 발표는 AI 기술이 실제 제품과 업무에 어떻게 적용되는지 보여줍니다. 초보자는 무엇이 새로 생겼는지뿐 아니라 자신의 작업 방식, 비용, 주의사항이 달라지는지도 함께 살펴보면 좋습니다."


class ContentTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ignored_tags = {"script", "style", "nav", "header", "footer", "noscript"}
        self.ignore_depth = 0
        self.text_parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() in self.ignored_tags:
            self.ignore_depth += 1

    def handle_endtag(self, tag):
        if tag.lower() in self.ignored_tags and self.ignore_depth > 0:
            self.ignore_depth -= 1

    def handle_data(self, data):
        if self.ignore_depth == 0:
            cleaned = data.strip()
            if cleaned:
                self.text_parts.append(cleaned)

    def get_text(self) -> str:
        return " ".join(self.text_parts)


def normalize_content(content_bytes: bytes, content_type: str = "") -> str:
    text = content_bytes.decode("utf-8", errors="replace")
    if "text/html" in content_type or "<html" in text[:200].lower():
        parser = ContentTextExtractor()
        try:
            parser.feed(text)
            extracted = parser.get_text()
        except Exception:
            extracted = clean_html_text(text)
        return re.sub(r"\s+", " ", extracted).strip()
    return re.sub(r"\s+", " ", text).strip()


NO_KNOWN = (frozenset(), frozenset())


def new_stats() -> dict:
    return {"held_count": 0, "excluded_count": 0, "skipped_count": 0, "coverage_limited": False}


def url_id(canonical_url: str) -> str:
    return hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()[:16]


def parse_iso(value) -> datetime | None:
    try:
        return datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
    except (AttributeError, ValueError):
        return None


def classify_date(dt: datetime, window_start: datetime, window_end: datetime) -> tuple[str, dict]:
    """(상태, 날짜 필드) 반환. 상태: ok/old/future. 시간대 없는 값은 날짜만 확인된 것으로 보고 시각을 만들지 않는다."""
    if dt.tzinfo is None:
        day = dt.date()
        if day < window_start.astimezone(KST).date():
            return "old", {}
        if day > window_end.astimezone(KST).date():
            return "future", {}
        return "ok", {"published_on": day.isoformat(), "date_precision": "day"}
    if dt < window_start:
        return "old", {}
    if dt > window_end:
        return "future", {}
    return "ok", {"published_at": dt.astimezone(timezone.utc).isoformat(), "date_precision": "time"}


def make_candidate(title: str, source_id: str, source_name: str, canonical_url: str, summary_raw: str, date_fields: dict) -> dict:
    source_summary = clean_html_text(summary_raw)[:SUMMARY_MAX]
    candidate = {
        "id": url_id(canonical_url),
        "title": title,
        "source_id": source_id,
        "source_name": source_name,
        "source_url": canonical_url,
        "source_summary": source_summary,
        "why_it_matters": build_beginner_explanation(title, source_id, source_summary),
        "fetched_at": datetime.now(KST).isoformat(timespec="seconds"),
        **date_fields,
    }
    release_title = translated_release_title(title, source_id)
    if release_title:
        candidate["title_ko"] = release_title
    elif needs_korean_translation(title):
        candidate["title_ko"] = translate_to_korean(title)
    if needs_korean_translation(source_summary):
        candidate["source_summary_ko"] = translate_to_korean(source_summary)
    return candidate


def ensure_beginner_explanations(articles: list[dict]) -> bool:
    """누락된 해설만 보강하고 편집자가 쓴 기존 해설은 보존한다."""
    changed = False
    for article in articles:
        if isinstance(article, dict) and not str(article.get("why_it_matters") or "").strip():
            article["why_it_matters"] = build_beginner_explanation(
                str(article.get("title") or ""),
                str(article.get("source_id") or ""),
                str(article.get("source_summary") or ""),
            )
            changed = True
    return changed


def archive_keys(articles: list) -> tuple[set, set]:
    ids = {a.get("id") for a in articles if isinstance(a, dict)}
    urls = {canonicalize_url(a["source_url"]) for a in articles if isinstance(a, dict) and isinstance(a.get("source_url"), str)}
    return ids, urls


def article_sort_key(article: dict) -> tuple:
    """KST 발행일 내림차순 → 같은 날은 time 정밀도(시각 내림차순) 먼저 → day 정밀도는 id 오름차순."""
    aid = str(article.get("id", ""))
    try:
        if article.get("date_precision") == "day":
            day = datetime.strptime(article["published_on"], "%Y-%m-%d").date()
            return (-day.toordinal(), 1, 0.0, aid)
        dt = datetime.fromisoformat(article["published_at"])
        return (-dt.astimezone(KST).date().toordinal(), 0, -dt.timestamp(), aid)
    except (KeyError, TypeError, ValueError):
        return (0, 2, 0.0, aid)  # 날짜 불량 항목은 맨 뒤로 (check_content가 잡는다)


def merge_archive(today: dict, new_items: list[dict]) -> tuple[list[dict], bool]:
    """새 항목만 누적하고 정렬한다. 기존 기사 객체는 수정하지 않는다. 반환: (추가된 항목, articles 변화 여부)"""
    articles = today.get("articles") or []
    ids, urls = archive_keys(articles)
    added = []
    for item in new_items:
        url = canonicalize_url(item["source_url"])
        if item["id"] in ids or url in urls:
            continue
        ids.add(item["id"])
        urls.add(url)
        added.append(item)
    merged = sorted(articles + added, key=article_sort_key)
    changed = merged != articles
    today["articles"] = merged
    return added, changed


def parse_rss_feed(xml_bytes: bytes, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN) -> tuple[list[dict], dict]:
    candidates = []
    stats = new_stats()
    reached_start = False
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as error:
        raise RuntimeError(f"RSS XML 파싱 실패: {error}")

    channel = root.find("channel")
    if channel is None:
        raise RuntimeError("RSS channel 요소를 찾을 수 없습니다.")

    items = channel.findall("item")
    if not items:
        raise RuntimeError("RSS 항목이 없습니다. 빈 수집 성공으로 처리하지 않습니다.")
    for item in items:
        title_el = item.find("title")
        link_el = item.find("link")
        pubdate_el = item.find("pubDate")
        desc_el = item.find("description")

        title = (title_el.text or "").strip() if title_el is not None else ""
        raw_url = (link_el.text or "").strip() if link_el is not None else ""
        pubdate_str = (pubdate_el.text or "").strip() if pubdate_el is not None else ""
        desc_raw = (desc_el.text or "").strip() if desc_el is not None else ""

        if not title or not raw_url or not pubdate_str:
            stats["held_count"] += 1
            continue

        try:
            validate_url(raw_url)
        except ValueError:
            stats["held_count"] += 1
            continue

        try:
            pub_dt = parsedate_to_datetime(pubdate_str)
            if pub_dt.tzinfo is None:
                stats["held_count"] += 1
                continue
        except Exception:
            stats["held_count"] += 1
            continue

        state, date_fields = classify_date(pub_dt, window_start, window_end)
        if state == "old":
            reached_start = True
            continue
        if state == "future":
            stats["excluded_count"] += 1
            continue

        canonical_url = canonicalize_url(raw_url)
        if url_id(canonical_url) in known[0] or canonical_url in known[1]:
            stats["skipped_count"] += 1
            continue

        candidates.append(make_candidate(title, source_id, source_name, canonical_url, desc_raw, date_fields))

    # 피드가 60일 시작 이전까지 닿지 않으면 출처가 이력을 제한한 것으로 기록
    stats["coverage_limited"] = not reached_start
    return candidates, stats


def parse_release_page(releases: list, owner_repo: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple, candidates: list, stats: dict) -> bool:
    """Releases API 한 페이지를 처리한다. 60일 시작보다 오래된 release를 만나면 True."""
    reached_start = False
    expected_prefix = f"/{owner_repo}/releases/tag/"
    for rel in releases:
        if not isinstance(rel, dict):
            stats["held_count"] += 1
            continue
        pub_dt = parse_iso(rel.get("published_at"))
        if pub_dt is not None and pub_dt.tzinfo is not None and pub_dt < window_start:
            reached_start = True
            continue

        tag = rel.get("tag_name") or ""
        title = (rel.get("name") or tag).strip()
        if rel.get("draft") or rel.get("prerelease") or PRERELEASE_RE.search(title) or PRERELEASE_RE.search(tag):
            stats["excluded_count"] += 1
            continue

        href = rel.get("html_url") or ""
        try:
            validate_url(href)
        except ValueError:
            stats["held_count"] += 1
            continue
        p_href = urllib.parse.urlsplit(href)
        if not title or pub_dt is None or pub_dt.tzinfo is None or \
           (p_href.hostname or "").lower() != "github.com" or not p_href.path.startswith(expected_prefix):
            stats["held_count"] += 1
            continue

        state, date_fields = classify_date(pub_dt, window_start, window_end)
        if state != "ok":
            stats["excluded_count"] += 1
            continue

        canonical_url = canonicalize_url(href)
        if url_id(canonical_url) in known[0] or canonical_url in known[1]:
            stats["skipped_count"] += 1
            continue

        candidates.append(make_candidate(title, source_id, source_name, canonical_url, rel.get("body") or "", date_fields))
    return reached_start


def parse_github_releases(owner_repo: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN) -> tuple[list[dict], dict]:
    candidates = []
    stats = new_stats()
    stats["coverage_limited"] = True  # 60일 시작 또는 목록 끝에 닿으면 해제
    for page in range(1, MAX_RELEASE_PAGES + 1):
        api_url = f"https://api.github.com/repos/{owner_repo}/releases?per_page={RELEASES_PER_PAGE}&page={page}"
        status, _, body = fetch_url(api_url, max_bytes=RELEASES_MAX_BYTES)
        if status != 200:
            raise RuntimeError(f"HTTP {status}: {api_url}")
        releases = json.loads(body.decode("utf-8"))
        if not isinstance(releases, list):
            raise RuntimeError("Releases API 응답이 목록 형식이 아닙니다.")
        if not releases:
            if page == 1:
                raise RuntimeError("Releases 항목이 없습니다. 빈 수집 성공으로 처리하지 않습니다.")
            stats["coverage_limited"] = False
            break
        if parse_release_page(releases, owner_repo, source_id, source_name, window_start, window_end, known, candidates, stats):
            stats["coverage_limited"] = False
            break
    return candidates, stats


def parse_html_news(index_url: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN, old_urls: set = None) -> tuple[list[dict], dict]:
    """old_urls: 이전 실행에서 60일 시작보다 오래된 것으로 확정된 URL 캐시(제자리 갱신). 오래된 기사는 다시 범위에 들어오지 않는다."""
    candidates = []
    stats = new_stats()
    reached_start = False
    if old_urls is None:
        old_urls = set()

    status, _, body = fetch_url(index_url)
    if status != 200:
        raise RuntimeError(f"HTTP {status}: {index_url}")

    html_text = body.decode("utf-8", errors="replace")
    raw_links = re.findall(r'href=["\']([^"\']+)["\']', html_text)
    base_host = (urllib.parse.urlsplit(index_url).hostname or "").lower()

    article_urls = []
    seen = set()
    for raw in raw_links:
        joined = urllib.parse.urljoin(index_url, raw)
        p = urllib.parse.urlsplit(joined)
        if (p.hostname or "").lower() != base_host:
            continue
        clean_path = p.path.rstrip("/")
        if clean_path != "/news" and clean_path.startswith("/news/"):
            c_url = canonicalize_url(joined)
            if c_url not in seen:
                seen.add(c_url)
                article_urls.append(c_url)

    if not article_urls:
        raise RuntimeError(f"{source_name}: HTML 기사 목록을 추출할 수 없습니다 (형식 변경 의심).")

    old_urls.intersection_update(article_urls)
    for art_url in article_urls:
        # archive에 있거나 오래된 것으로 확정된 기사는 상세 요청 전에 건너뜀
        if url_id(art_url) in known[0] or art_url in known[1]:
            stats["skipped_count"] += 1
            continue
        if art_url in old_urls:
            reached_start = True
            stats["excluded_count"] += 1
            continue

        try:
            validate_url(art_url)
        except ValueError:
            stats["held_count"] += 1
            continue

        try:
            art_status, _, art_body = fetch_url(art_url)
            if art_status != 200:
                stats["held_count"] += 1
                continue
            art_html = art_body.decode("utf-8", errors="replace")
        except Exception:
            stats["held_count"] += 1
            continue

        title_m = re.search(r'<meta\b[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)
        if not title_m:
            title_m = re.search(r'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:title["\']', art_html, re.I)
        if not title_m:
            title_m = re.search(r'<title\b[^>]*>([^<]+)</title>', art_html, re.I)
        title = html.unescape(title_m.group(1)).strip() if title_m else ""
        title = re.sub(r'\s*[\-|–—\\]\s*(?:Anthropic|xAI).*$', '', title, flags=re.I).strip()

        date_str = None
        for jld in re.findall(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>', art_html, re.I):
            try:
                jdata = json.loads(jld)
                stack = [jdata] if isinstance(jdata, dict) else list(jdata) if isinstance(jdata, list) else []
                while stack:
                    curr = stack.pop()
                    if isinstance(curr, dict):
                        if "datePublished" in curr and isinstance(curr["datePublished"], str):
                            date_str = curr["datePublished"]
                            break
                        for v in curr.values():
                            if isinstance(v, (dict, list)):
                                stack.append(v)
                    elif isinstance(curr, list):
                        stack.extend(curr)
                if date_str:
                    break
            except Exception:
                continue

        if not date_str:
            m = re.search(r'<meta\b[^>]*property=["\'](?:article:published_time|og:published_time)["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)
            if not m:
                m = re.search(r'<meta\b[^>]*content=["\']([^"\']+)["\'][^>]*property=["\'](?:article:published_time|og:published_time)["\']', art_html, re.I)
            if m:
                date_str = m.group(1).strip()

        if not date_str:
            m = re.search(r'<time\b[^>]*datetime=["\']([^"\']+)["\']', art_html, re.I)
            if m:
                date_str = m.group(1).strip()

        if not date_str:
            # 본문에 날짜만 표시된 경우("Sep 18, 2026"): 시각 불명이므로 날짜만 넘겨 아래 날짜 전용 경로가 처리.
            m = re.search(
                r'<div\b[^>]*class=["\'][^"\']*\bbody-3\b[^"\']*\bagate\b[^"\']*["\'][^>]*>\s*'
                r'([A-Z][a-z]{2} \d{1,2}, \d{4})\s*</div>',
                art_html,
            )
            if m:
                try:
                    date_str = datetime.strptime(m.group(1), "%b %d, %Y").strftime("%Y-%m-%d")
                except ValueError:
                    pass

        # 날짜·발행 메타데이터를 전혀 확인할 수 없으면 보류. 별도 큐 없이 다음 60일 실행에서 다시 확인한다.
        pub_dt = parse_iso(date_str)
        if pub_dt is None or not title:
            stats["held_count"] += 1
            continue

        state, date_fields = classify_date(pub_dt, window_start, window_end)
        if state == "old":
            reached_start = True
            old_urls.add(art_url)
        if state != "ok":
            stats["excluded_count"] += 1
            continue

        desc_m = re.search(r'<meta\b[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)
        if not desc_m:
            desc_m = re.search(r'<meta\b[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)

        candidates.append(make_candidate(title, source_id, source_name, art_url, desc_m.group(1) if desc_m else "", date_fields))

    # 목록에 60일 시작 이전 기사가 하나도 없으면 목록 노출 개수가 이력을 제한한 것으로 기록
    stats["coverage_limited"] = not reached_start
    return candidates, stats


def collect_news() -> int:
    now_kst = datetime.now(KST)
    window_end = now_kst
    window_start = now_kst - timedelta(days=WINDOW_DAYS)
    edition_date = window_end.strftime("%Y-%m-%d")
    collected_at = now_kst.isoformat()

    source_cache = read_json(SOURCE_CACHE_PATH)
    news_cache = source_cache.setdefault("news", {})

    today = {"edition_date": None, "window_start": None, "window_end": None, "collected_at": None,
             "reviewed_at": None, "articles": [], **read_json(TODAY_PATH)}
    if not isinstance(today["articles"], list):
        raise ValueError("data/today.json의 articles가 배열이 아닙니다. 공개 archive를 보호하기 위해 중단합니다.")
    explanations_changed = ensure_beginner_explanations(today["articles"])
    known = archive_keys(today["articles"])

    sources_def = [
        {"id": "openai-news", "name": "OpenAI News", "url": "https://openai.com/news/rss.xml", "type": "rss"},
        {"id": "google-ai", "name": "Google AI", "url": "https://blog.google/innovation-and-ai/technology/ai/rss/", "type": "rss"},
        {"id": "codex-releases", "name": "Codex Releases", "url": "https://github.com/openai/codex/releases", "type": "releases", "repo": "openai/codex"},
        {"id": "gemini-releases", "name": "Gemini CLI Releases", "url": "https://github.com/google-gemini/gemini-cli/releases", "type": "releases", "repo": "google-gemini/gemini-cli"},
        {"id": "anthropic-news", "name": "Anthropic News", "url": "https://www.anthropic.com/news", "type": "html"},
        {"id": "xai-news", "name": "xAI News", "url": "https://x.ai/news", "type": "html"},
    ]

    all_candidates = []
    sources_health = []
    failed_sources = 0

    for sdef in sources_def:
        sid = sdef["id"]
        sname = sdef["name"]
        surl = sdef["url"]
        stype = sdef["type"]

        items = []
        stats = new_stats()
        error_msg = None
        # 60일 수집은 조건부 요청(304)을 쓰지 않고 항상 전체 재조회한다.
        cache_entry = {"last_checked": collected_at, "window_days": WINDOW_DAYS}

        try:
            if stype == "rss":
                status, _, body = fetch_url(surl)
                if status != 200:
                    raise RuntimeError(f"HTTP {status}: {surl}")
                items, stats = parse_rss_feed(body, sid, sname, window_start, window_end, known)
            elif stype == "releases":
                items, stats = parse_github_releases(sdef["repo"], sid, sname, window_start, window_end, known)
            elif stype == "html":
                old_urls = set(news_cache.get(sid, {}).get("old_urls", []))
                items, stats = parse_html_news(surl, sid, sname, window_start, window_end, known, old_urls)
                cache_entry["old_urls"] = sorted(old_urls)
            news_cache[sid] = cache_entry
        except Exception as error:
            error_msg = str(error)
            failed_sources += 1

        if error_msg:
            source_status = "failed"
        elif stats["held_count"] > 0:
            source_status = "partial"
        else:
            source_status = "ok"

        source_report = {
            "id": sid,
            "name": sname,
            "url": surl,
            "status": source_status,
            "count": len(items),
            **stats
        }
        if error_msg:
            source_report["error"] = error_msg

        sources_health.append(source_report)
        all_candidates.extend(items)

    # archive 및 동일 실행 내부의 id/정규화 URL 중복을 제거하며 새 항목만 누적
    candidates_list, merged_changed = merge_archive(today, all_candidates)
    archive_changed = explanations_changed or merged_changed
    candidates_list.sort(key=article_sort_key)
    if archive_changed:
        today.update(edition_date=edition_date, window_start=window_start.isoformat(),
                     window_end=window_end.isoformat(), collected_at=collected_at)
        write_json(TODAY_PATH, today)

    if failed_sources == len(sources_def):
        news_status = "failed"
    elif failed_sources > 0 or any(s["held_count"] > 0 for s in sources_health):
        news_status = "partial"
    else:
        news_status = "ok"

    # Save candidates
    candidates_data = {
        "collected_at": collected_at,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "edition_date": edition_date,
        "sources": sources_health,
        "new_count": len(candidates_list),
        "archive_count": len(today["articles"]),
        "candidates": candidates_list
    }
    write_json(CANDIDATES_PATH, candidates_data)

    # Update content health (news section only)
    current_health = read_json(HEALTH_PATH)
    current_health["news"] = {
        "checked_at": collected_at,
        "status": news_status,
        "candidate_count": len(candidates_list),
        "archive_count": len(today["articles"]),
        "sources": sources_health
    }
    if "documents" not in current_health:
        current_health["documents"] = {"checked_at": None, "sources": []}
    write_json(HEALTH_PATH, current_health)

    # Update source cache
    source_cache["updated_at"] = collected_at
    write_json(SOURCE_CACHE_PATH, source_cache)

    print(f"[뉴스 수집 완료] 상태: {news_status}, 최근 {WINDOW_DAYS}일 신규: {len(candidates_list)}건, archive: {len(today['articles'])}건, 실패 출처: {failed_sources}/{len(sources_def)}")
    for s in sources_health:
        info = f"  - {s['name']}: {s['status']} (신규 {s['count']}건, 기존 건너뜀 {s['skipped_count']}건, 보류 {s['held_count']}건)"
        if s["coverage_limited"]:
            info += " [출처 제공 범위가 60일에 못 미침]"
        if "error" in s:
            info += f" [오류: {s['error']}]"
        print(info)

    if news_status == "failed":
        return 1
    return 0


def extract_document_sources() -> dict[str, int]:
    configs = [
        (DATA_DIR / "agents.json", 1),
        (DATA_DIR / "agent-engineering.json", 7),
        (DATA_DIR / "learn.json", 30),
        (DATA_DIR / "glossary.json", 30),
    ]
    url_intervals = {}
    for path, interval in configs:
        if not path.exists():
            continue
        data = read_json(path)
        items = data.get("documents") or data.get("terms") or []
        for item in items:
            for src in item.get("sources", []):
                raw_url = src.get("url")
                if raw_url:
                    try:
                        c_url = canonicalize_url(raw_url)
                        if c_url in url_intervals:
                            url_intervals[c_url] = min(url_intervals[c_url], interval)
                        else:
                            url_intervals[c_url] = interval
                    except Exception:
                        pass
    return url_intervals


def collect_documents(force: bool = False) -> int:
    now_kst = datetime.now(KST)
    now_iso = now_kst.isoformat()

    url_intervals = extract_document_sources()
    if not url_intervals:
        print("[문서 점검] 점검할 출처 URL이 없습니다.")
        return 0

    source_cache = read_json(SOURCE_CACHE_PATH)
    docs_cache = source_cache.setdefault("documents", {})

    current_health = read_json(HEALTH_PATH)
    prev_docs = current_health.get("documents", {}).get("sources", [])
    prev_by_url = {s.get("url"): s for s in prev_docs if isinstance(s, dict) and "url" in s}

    sources_health = []
    total_due = 0
    failed_due = 0

    for url, interval_days in sorted(url_intervals.items()):
        cached = docs_cache.get(url, {})
        last_checked_str = cached.get("last_checked") or prev_by_url.get(url, {}).get("checked_at")
        prev_changed_at = cached.get("changed_at") or prev_by_url.get(url, {}).get("changed_at")
        prev_status = cached.get("status") or prev_by_url.get(url, {}).get("status")

        is_due = force or not last_checked_str or prev_status == "failed"
        if not is_due and last_checked_str:
            try:
                dt_checked = datetime.fromisoformat(last_checked_str)
                is_due = (now_kst - dt_checked).total_seconds() >= interval_days * 86400
            except Exception:
                is_due = True

        if not is_due:
            # Preserve existing health entry
            existing = prev_by_url.get(url)
            if existing:
                sources_health.append(existing)
            else:
                sources_health.append({
                    "url": url,
                    "status": "unchanged",
                    "checked_at": last_checked_str
                })
            continue

        total_due += 1
        etag = cached.get("etag") if cached.get("hash") else None
        last_mod = cached.get("last_modified") if cached.get("hash") else None

        try:
            status, headers, body = fetch_url(url, etag=etag, last_modified=last_mod)
            if status == 304:
                status_code = "changed" if prev_changed_at else "unchanged"
                report = {
                    "url": url,
                    "status": status_code,
                    "checked_at": now_iso
                }
                if prev_changed_at:
                    report["changed_at"] = prev_changed_at
                    docs_cache[url]["changed_at"] = prev_changed_at
                docs_cache[url]["last_checked"] = now_iso
                docs_cache[url]["status"] = status_code
                sources_health.append(report)
            elif status == 200:
                ctype = headers.get("content-type", "")
                norm_text = normalize_content(body, ctype)
                new_hash = hashlib.sha256(norm_text.encode("utf-8")).hexdigest()
                prev_hash = cached.get("hash")

                if not prev_hash:
                    # Baseline initial check
                    report = {
                        "url": url,
                        "status": "baseline",
                        "checked_at": now_iso
                    }
                    docs_cache[url] = {
                        "hash": new_hash,
                        "etag": headers.get("etag"),
                        "last_modified": headers.get("last-modified"),
                        "last_checked": now_iso,
                        "status": "baseline"
                    }
                    if prev_changed_at:
                        report.update(status="changed", changed_at=prev_changed_at)
                        docs_cache[url].update(status="changed", changed_at=prev_changed_at)
                elif new_hash == prev_hash:
                    status_code = "changed" if prev_changed_at else "unchanged"
                    report = {
                        "url": url,
                        "status": status_code,
                        "checked_at": now_iso
                    }
                    if prev_changed_at:
                        report["changed_at"] = prev_changed_at
                        docs_cache[url]["changed_at"] = prev_changed_at
                    docs_cache[url]["etag"] = headers.get("etag")
                    docs_cache[url]["last_modified"] = headers.get("last-modified")
                    docs_cache[url]["last_checked"] = now_iso
                    docs_cache[url]["status"] = status_code
                else:
                    # Newly different hash -> update changed_at to now_iso
                    changed_at = now_iso
                    report = {
                        "url": url,
                        "status": "changed",
                        "checked_at": now_iso,
                        "changed_at": changed_at
                    }
                    docs_cache[url] = {
                        "hash": new_hash,
                        "etag": headers.get("etag"),
                        "last_modified": headers.get("last-modified"),
                        "last_checked": now_iso,
                        "changed_at": changed_at,
                        "status": "changed"
                    }
                sources_health.append(report)
            else:
                failed_due += 1
                report = {
                    "url": url,
                    "status": "failed",
                    "checked_at": now_iso,
                    "error": f"HTTP {status}"
                }
                if prev_changed_at:
                    report["changed_at"] = prev_changed_at
                docs_cache.setdefault(url, {})["status"] = "failed"
                docs_cache[url]["last_checked"] = now_iso
                sources_health.append(report)
        except Exception as error:
            failed_due += 1
            report = {
                "url": url,
                "status": "failed",
                "checked_at": now_iso,
                "error": str(error)
            }
            if prev_changed_at:
                report["changed_at"] = prev_changed_at
            docs_cache.setdefault(url, {})["status"] = "failed"
            docs_cache[url]["last_checked"] = now_iso
            sources_health.append(report)

    current_health["documents"] = {
        "checked_at": now_iso,
        "sources": sources_health
    }
    if "news" not in current_health:
        current_health["news"] = {"checked_at": None, "status": "not_collected", "candidate_count": 0, "sources": []}
    write_json(HEALTH_PATH, current_health)

    source_cache["updated_at"] = now_iso
    write_json(SOURCE_CACHE_PATH, source_cache)

    print(f"[문서 점검 완료] 전체 출처: {len(url_intervals)}개, 점검 대상: {total_due}개, 실패: {failed_due}개")
    if total_due > 0 and failed_due == total_due:
        print("[문서 점검 전체 실패] 모든 대상 출처 점검에 실패했습니다.", file=sys.stderr)
        return 1
    return 0


def main():
    parser = argparse.ArgumentParser(description="AgentTutor 뉴스 및 문서 출처 수집·점검 도구")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("news", help="최근 60일 뉴스를 수집해 archive(data/today.json)에 누적하고 헬스 정보를 갱신합니다.")

    doc_parser = subparsers.add_parser("documents", help="학습 자료 출처의 변경 사항을 점검합니다.")
    doc_parser.add_argument("--force", action="store_true", help="점검 주기와 관계없이 모든 출처를 강제 점검합니다.")

    args = parser.parse_args()
    if args.command == "news":
        sys.exit(collect_news())
    elif args.command == "documents":
        sys.exit(collect_documents(force=args.force))


if __name__ == "__main__":
    main()
