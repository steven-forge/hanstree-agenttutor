#!/usr/bin/env python3
"""AgentTutor 뉴스 후보 및 학습 자료 출처 갱신 스크립트"""

import argparse
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import hashlib
import html
from html.parser import HTMLParser
import json
import os
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
NEWS_SOURCES_PATH = DATA_DIR / "news-sources.json"
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
RELEASE_SOURCE_IDS = {"codex-releases", "gemini-releases", "claude-releases", "grok-releases"}
OFFICIAL_NEWS_SOURCE_IDS = {"openai-news", "google-ai", "anthropic-news", "xai-news"}
# 뉴스룸 추천 카드가 /news/ 대신 모델 전용 슬러그로 연결되는 경우(/claude-opus-5-5, /claude-sonnet-5, /claude-fable-and-mythos-5-1). 같은 호스트·단일 경로 세그먼트만.
MODEL_SLUG_RE = re.compile(r'^/claude-[a-z]+(?:-and-[a-z]+)?(?:-\d+)+$')
# 수집 규칙보다 넓은 감지용: 'claude'와 숫자가 든 단일 세그먼트. 수집 규칙에 안 걸리면 보류로 드러낸다.
MODEL_LINK_RE = re.compile(r'^/[a-z0-9-]*claude[a-z0-9-]*\d[a-z0-9-]*$')
# ponytail: 보수적 출시 판정. 모델명+버전이 제목에 있고, 출시 동사가 있거나 URL이 모델 전용 슬러그일 때만 high.
MODEL_NAME_RE = re.compile(r'(?i)\b(claude|gpt|gemini|grok)[\s-]?(opus|sonnet|haiku|fable|mythos|pro|flash|ultra|nano|mini)?[\s-]?\d')
LAUNCH_TITLE_RE = re.compile(r'(?i)^(introducing|announcing|meet)\b|\b(now available|launch(es|ed|ing)?|releas(e|es|ed|ing))\b')


def is_model_launch(title: str, canonical_url: str) -> bool:
    if not MODEL_NAME_RE.search(title):
        return False
    path = urllib.parse.urlsplit(canonical_url).path.rstrip("/")
    return bool(LAUNCH_TITLE_RE.search(title) or MODEL_SLUG_RE.match(path))

ALLOWED_HOSTS = {
    "openai.com", "www.openai.com", "learn.chatgpt.com", "developers.openai.com",
    "anthropic.com", "www.anthropic.com", "code.claude.com", "platform.claude.com",
    "blog.google", "ai.google.dev", "developers.google.com", "gemini.google", "geminicli.com", "www.geminicli.com",
    "x.ai", "www.x.ai", "docs.x.ai",
    "claude.dev", "www.claude.dev",
    "agentskills.io", "www.agentskills.io",
    "modelcontextprotocol.io", "huggingface.co",
    "w3.org", "www.w3.org",
    "github.com", "api.github.com",
    "about.fb.com", "dev.meta.ai", "api-docs.deepseek.com"
}
TRANSLATION_HOST = "api.mymemory.translated.net"


def registered_hosts_for_source(source_id: str) -> frozenset[str]:
    """source_id에 등록된 호스트만 허용한다. data/news-sources.json에 등록된 외부 출처는 그 hosts,
    그 외(공식 6개 출처)는 ALLOWED_HOSTS로 제한한다. URL 자체의 hostname을 허용 목록으로 쓰지 않는다."""
    config = read_json(NEWS_SOURCES_PATH)
    for sdef in config.get("sources") or []:
        if isinstance(sdef, dict) and sdef.get("id") == source_id:
            return frozenset(str(h).lower() for h in sdef.get("hosts") or [])
    return ALLOWED_HOSTS


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
    """allowed_hosts=None은 네트워크 요청이 아닌 링크(외부 매체 기사 URL) 검사에만 쓴다. fetch_url은 None을 거부한다."""
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError(f"HTTPS 프로토콜만 허용됩니다: {url}")
    if parsed.username or parsed.password:
        raise ValueError(f"사용자 인증 정보가 포함된 URL은 거부됩니다: {url}")
    if parsed.port and parsed.port != 443:
        raise ValueError(f"비정상 포트는 허용되지 않습니다: {url}")
    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError(f"호스트가 없는 URL입니다: {url}")
    if allowed_hosts is not None and hostname not in allowed_hosts:
        raise ValueError(f"허용되지 않은 호스트입니다: {hostname}")


KNOWN_TRACKING_PARAMS = {"ref", "source", "fbclid", "gclid", "yclid", "_ga", "mc_cid", "mc_eid"}


def canonicalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    q_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(k, v) for k, v in q_pairs if not (k.lower().startswith("utm_") or k.lower() in KNOWN_TRACKING_PARAMS)]
    new_query = urllib.parse.urlencode(filtered)
    path = parsed.path.rstrip("/") if parsed.path != "/" else "/"
    hostname = (parsed.hostname or "").lower()
    fragment = parsed.fragment if (hostname == "docs.x.ai" and path == "/developers/release-notes") else ""
    return urllib.parse.urlunsplit((parsed.scheme.lower(), hostname, path, new_query, fragment))


def fetch_url(url: str, etag: str = None, last_modified: str = None, max_retries: int = 2, max_bytes: int = MAX_BYTES, allowed_hosts=ALLOWED_HOSTS, extra_headers: dict = None, data: bytes = None) -> tuple[int, dict, bytes]:
    if allowed_hosts is None:
        raise ValueError("네트워크 요청에는 명시적 허용 호스트가 필요합니다.")
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
    if extra_headers:
        headers.update(extra_headers)  # API 인증은 헤더로만 전달한다. URL·오류 메시지에 비밀값이 남지 않는다.

    opener = urllib.request.build_opener(SafeRedirectHandler(allowed_hosts))
    request = urllib.request.Request(url, data=data, headers=headers)

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
    product = (
        "Codex" if source_id == "codex-releases"
        else "Gemini CLI" if source_id == "gemini-releases"
        else "Claude Code" if source_id == "claude-releases"
        else None
    )
    if not product:
        return None
    version = re.sub(r"(?i)^release\s+", "", title.strip())
    if source_id == "claude-releases" and not version.lower().startswith("v"):
        version = f"v{version}"
    return f"{product} {version} 버전 출시"


def clean_release_bullet(line: str) -> str:
    """릴리스 본문 불릿에서 compare 링크, 작성자, PR 번호 등 장식을 제거한다."""
    s = line.strip()
    if not s:
        return ""
    s = re.sub(r"^[-*+]\s+", "", s).strip()
    if not s:
        return ""

    # Full Changelog 또는 compare 전용 줄 제외
    if re.search(r"(?i)\b(?:full\s+changelog|compare)\b", s) and re.search(r"https?://github\.com/\S+/compare/\S+", s):
        return ""
    if re.fullmatch(r"(?i)(?:\*{0,2}full\s+changelog\*{0,2}:?\s*)?https?://\S+", s):
        return ""

    # compare 링크 및 작성자/PR 장식 제거
    s = re.sub(r"https?://github\.com/\S+/compare/\S+", "", s)
    s = re.sub(r"(?i)\bby\s+@[\w-]+(?:\s+in\s+https?://\S+)?", "", s)
    s = re.sub(r"(?i)\bin\s+https?://github\.com/\S+/(?:pull|issues)/\d+", "", s)
    s = re.sub(r"https?://github\.com/\S+/(?:pull|issues)/\d+", "", s)
    s = re.sub(r"\(@[\w-]+\)", "", s)
    s = re.sub(r"(?<=\s)@[\w-]+", "", s)
    s = re.sub(r"\[\s*#\d+\s*\]\([^)]+\)", "", s)
    s = re.sub(r"\(\s*#\d+(?:\s*,\s*#\d+)*\s*\)", "", s)
    s = re.sub(r"\[\s*#\d+(?:\s*,\s*#\d+)*\s*\]", "", s)
    s = re.sub(r"#\d+\b", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", s)
    s = re.sub(r"\(\s*\)", "", s)
    s = re.sub(r"\[\s*\]", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[\s,–—\-]+$", "", s).strip()
    return s


def release_bullet_category(bullet: str) -> str:
    """릴리스 불릿의 관용 접두어를 화면의 세 분류로 맞춘다."""
    normalized = re.sub(r"^\[[^\]]+\]\s*", "", bullet).strip()
    if re.match(r"(?i)^(?:feat(?:ure)?(?:\([^)]+\))?[:/\s]|feat/|added?\b|new\b|introduced?\b)", normalized):
        return "new_features"
    if re.match(r"(?i)^(?:fix(?:up)?(?:\([^)]+\))?[:/\s]|fix/|fixed?\b|resolved?\b)", normalized):
        return "bug_fixes"
    return "chores"


def extract_release_categories(body: str) -> dict[str, list[str]]:
    """GitHub release 원문 body에서 new_features, bug_fixes, chores 항목을 추출한다."""
    sections: dict[str, list[str]] = {"new_features": [], "bug_fixes": [], "chores": []}
    if not body or not body.strip():
        return sections

    lines = body.splitlines()

    # 1. 명시적 Markdown 제목 (Features, Bug Fixes, Chores) 우선 검사
    explicit_headings = {}
    current_head = None
    head_re = re.compile(r"^(#{1,6})\s+(.+)$")

    for line in lines:
        m = head_re.match(line.strip())
        if m:
            title = re.sub(r"[*_`]", "", m.group(2)).strip().lower()
            if re.search(r"\b(new\s+features?|features?)\b", title):
                current_head = "new_features"
                explicit_headings["new_features"] = True
            elif re.search(r"\b(bug\s+fixes?|fixes?)\b", title):
                current_head = "bug_fixes"
                explicit_headings["bug_fixes"] = True
            elif re.search(r"\b(chores?|maintenance)\b", title):
                current_head = "chores"
                explicit_headings["chores"] = True
            elif re.search(r"\b(what['’]?s\s+changed|changelog|changes)\b", title):
                current_head = "whats_changed"
            else:
                current_head = "other"
            continue

        if current_head in ("new_features", "bug_fixes", "chores"):
            bullet = clean_release_bullet(line)
            if bullet:
                sections[current_head].append(bullet)

    # 명시적 제목이 하나라도 있고 항목이 추출되었으면 반환
    if any(explicit_headings.get(k) for k in ("new_features", "bug_fixes", "chores")):
        return sections

    # 2. 명시적 제목이 없으면 What's Changed 또는 bullet들을 conventional prefix로 분류
    for line in lines:
        if not re.match(r"^\s*[-*+]\s+", line):
            continue
        bullet = clean_release_bullet(line)
        if not bullet:
            continue
        sections[release_bullet_category(bullet)].append(bullet)

    return sections


def build_release_summary_en(bullets: list[str]) -> str:
    """분류별 최대 3개 bullet, 합계 420바이트 이내의 영어 요약 문자열을 만든다."""
    # ponytail: 분류별 최대 3개 bullet 및 420바이트 상한 (MyMemory 500바이트 단일 번역 호출 보장). 초과 시 축약.
    selected = []
    current_bytes = 0
    for b in bullets:
        if len(selected) >= 3:
            break
        text = b.strip()
        if not text:
            continue
        sep_len = 1 if selected else 0
        b_bytes = len(text.encode("utf-8"))
        if current_bytes + sep_len + b_bytes <= 420:
            selected.append(text)
            current_bytes += sep_len + b_bytes
        else:
            if not selected:
                truncated = text
                while truncated and len(truncated.encode("utf-8")) > 420:
                    truncated = truncated[:-1]
                truncated = truncated.strip()
                if truncated:
                    selected.append(truncated)
            break
    return "\n".join(selected)


def build_release_notes_ko(body: str) -> dict[str, str]:
    """GitHub release body에서 3분류 요약을 추출하고 한국어로 번역하여 release_notes_ko를 생성한다."""
    categories = extract_release_categories(body)
    notes_ko: dict[str, str] = {}
    for cat in ("new_features", "bug_fixes", "chores"):
        bullets = categories.get(cat, [])
        if not bullets:
            continue
        summary_en = build_release_summary_en(bullets)
        if not summary_en:
            continue
        if needs_korean_translation(summary_en):
            notes_ko[cat] = translate_to_korean(summary_en)
        else:
            notes_ko[cat] = summary_en
    return notes_ko


def build_beginner_explanation(title: str, source_id: str, source_summary: str = "") -> str:
    """제목·공식 설명의 주제만 분류해 원문 밖의 사실을 만들지 않는 한국어 해설을 만든다."""
    if source_id in RELEASE_SOURCE_IDS:
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


class ArticleBodyExtractor(HTMLParser):
    """<article> 또는 <main> 안의 p/h2/li 텍스트만 모은다(script/nav/header/footer/aside 등 제외). 둘 다 없으면 blocks가 비어 추출 실패로 처리된다."""

    def __init__(self):
        super().__init__()
        self.ignored_tags = {"script", "style", "nav", "header", "footer", "aside", "noscript"}
        self.ignore_depth = 0
        self.scope_depth = 0
        self.capture_tag = None
        self.buffer: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self.ignored_tags:
            self.ignore_depth += 1
            return
        if t in ("article", "main"):
            self.scope_depth += 1
            return
        if self.scope_depth == 0 or self.ignore_depth > 0:
            return
        if t in ("p", "h2", "li"):
            self.capture_tag = t
            self.buffer = []

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self.ignored_tags:
            if self.ignore_depth > 0:
                self.ignore_depth -= 1
            return
        if t in ("article", "main"):
            if self.scope_depth > 0:
                self.scope_depth -= 1
            return
        if t in ("p", "h2", "li") and self.capture_tag == t:
            text = clean_html_text("".join(self.buffer)).strip()
            if text:
                self.blocks.append(text)
            self.capture_tag = None
            self.buffer = []

    def handle_data(self, data):
        if self.ignore_depth > 0 or self.scope_depth == 0 or self.capture_tag is None:
            return
        self.buffer.append(data)


# ponytail: <article>/<main>이 없는 페이지 전용 fallback. 오탐 위험 때문에 FALLBACK_HOSTS에 등록된 호스트에만 적용한다.
FALLBACK_HOSTS = frozenset({"x.ai", "www.x.ai"})
FALLBACK_MIN_BLOCK_LEN = 60


class FallbackBodyExtractor(HTMLParser):
    """<article>/<main> 태그가 없는 페이지에서 nav/header/footer/aside/script/style 밖의 긴 p/h2/li 단락만 모은다."""

    def __init__(self):
        super().__init__()
        self.ignored_tags = {"script", "style", "nav", "header", "footer", "aside", "noscript"}
        self.ignore_depth = 0
        self.capture_tag = None
        self.buffer: list[str] = []
        self.blocks: list[str] = []

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self.ignored_tags:
            self.ignore_depth += 1
            return
        if self.ignore_depth > 0:
            return
        if t in ("p", "h2", "li"):
            self.capture_tag = t
            self.buffer = []

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self.ignored_tags:
            if self.ignore_depth > 0:
                self.ignore_depth -= 1
            return
        if t in ("p", "h2", "li") and self.capture_tag == t:
            text = clean_html_text("".join(self.buffer)).strip()
            if len(text) >= FALLBACK_MIN_BLOCK_LEN:
                self.blocks.append(text)
            self.capture_tag = None
            self.buffer = []

    def handle_data(self, data):
        if self.ignore_depth > 0 or self.capture_tag is None:
            return
        self.buffer.append(data)


SENTENCE_SPLIT_RE = re.compile(r'(?<=[.!?])\s+(?=[A-Z0-9"\'])')
SENTENCE_END_RE = re.compile(r'[.!?]["\')”’]?$')
MIN_SUMMARY_TEXT_LEN = 200
SUMMARY_WORD_RE = re.compile(r"[A-Za-z']+")
SUMMARY_STOPWORDS = frozenset({
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "at", "from", "as", "is", "are",
    "was", "were", "be", "been", "being", "its", "it", "this", "that", "these", "those", "here", "there", "how",
    "why", "what", "which", "who", "new", "now", "your", "you", "we", "they", "our", "can", "could", "will",
    "would", "should", "has", "have", "had", "into", "than", "more", "most", "about", "after", "over", "up",
    "out", "not", "just", "also", "but", "if", "so", "such", "when", "while", "all", "any", "each", "other",
})


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in SENTENCE_SPLIT_RE.split(text) if s.strip()]


def score_sentences(sentences: list[str]) -> list[tuple[int, float, str]]:
    """단어 빈도 기반 추출형 점수. 마침 페이지 서두 3문장을 그대로 베끼지 않고 본문 전체에서 고른다."""
    freq: dict[str, int] = {}
    for sentence in sentences:
        for word in SUMMARY_WORD_RE.findall(sentence.lower()):
            if len(word) < 3 or word in SUMMARY_STOPWORDS:
                continue
            freq[word] = freq.get(word, 0) + 1
    if not freq:
        return []
    max_freq = max(freq.values())
    scored = []
    for idx, sentence in enumerate(sentences):
        words = [w for w in SUMMARY_WORD_RE.findall(sentence.lower()) if len(w) >= 3 and w not in SUMMARY_STOPWORDS]
        if not words:
            continue
        score = sum(freq.get(w, 0) / max_freq for w in words) / len(words)
        scored.append((idx, score, sentence))
    return scored


def extractive_summary_sentences(blocks: list[str], max_sentences: int = 3) -> list[str] | None:
    """완전한 문장(종결 부호로 끝나고 단어 6개 이상)만 후보로 삼아 제목 조각·메뉴 문구가 섞이지 않게 한다."""
    text = " ".join(blocks)
    if len(text) < MIN_SUMMARY_TEXT_LEN:
        return None
    sentences = [
        s for s in split_sentences(text)
        if 40 <= len(s) <= 400 and SENTENCE_END_RE.search(s) and len(SUMMARY_WORD_RE.findall(s)) >= 6
    ]
    if len(sentences) < max_sentences:
        return None
    scored = score_sentences(sentences)
    if len(scored) < max_sentences:
        return None
    top = sorted(scored, key=lambda t: t[1], reverse=True)[:max_sentences]
    top.sort(key=lambda t: t[0])
    return [sentence for _, _, sentence in top]


def dedupe_blocks(blocks: list[str]) -> list[str]:
    """<article>과 <main>이 같은 본문을 중복 노출하는 경우 등, 동일 블록 반복을 제거한다(순서 보존)."""
    seen = set()
    deduped = []
    for block in blocks:
        if block in seen:
            continue
        seen.add(block)
        deduped.append(block)
    return deduped


def build_full_text_summary_ko(source_url: str, source_id: str, prefetched_html: str | None = None) -> str | None:
    """원문 <article>/<main> 본문(aside 제외) 전체에서 완전한 문장만 후보로 삼아 추출형 3문장을 골라 한국어로 번역한다.
    <article>/<main>이 없으면 FALLBACK_HOSTS에 등록된 호스트에 한해 nav/header/footer/aside 밖의 긴 p/h2/li로
    대체 추출한다. 호출 측이 이미 원문을 받아온 경우(prefetched_html)에는 다시 요청하지 않는다. SSRF 방지를 위해
    URL 자신의 hostname이 아니라 source_id에 등록된 호스트(registered_hosts_for_source)만 요청·리다이렉트를 허용한다.
    등록되지 않은 호스트나 본문이 요약에 부적합하면(길이 부족, 완전한 문장 3개 미만 등) provenance를 설정하지
    않도록 None을 반환(원래 설명 보존)."""
    try:
        if prefetched_html is not None:
            html_text = prefetched_html
        else:
            allowed_hosts = registered_hosts_for_source(source_id)
            hostname = (urllib.parse.urlsplit(source_url).hostname or "").lower()
            if not hostname or hostname not in allowed_hosts:
                return None
            status, headers, body = fetch_url(source_url, allowed_hosts=allowed_hosts, max_retries=1)
            if status != 200:
                return None
            ctype = headers.get("content-type", "")
            if "text/html" not in ctype and not body.lstrip().startswith((b"<!DOCTYPE", b"<html")):
                return None
            html_text = body.decode("utf-8", errors="replace")

        extractor = ArticleBodyExtractor()
        extractor.feed(html_text)
        blocks = dedupe_blocks(extractor.blocks)
        if not blocks:
            hostname = (urllib.parse.urlsplit(source_url).hostname or "").lower()
            if hostname in FALLBACK_HOSTS:
                fallback = FallbackBodyExtractor()
                fallback.feed(html_text)
                blocks = dedupe_blocks(fallback.blocks)
        sentences_en = extractive_summary_sentences(blocks)
        if not sentences_en:
            return None
        translated = [translate_to_korean(s) if needs_korean_translation(s) else s for s in sentences_en]
        if len(translated) != 3:
            return None
        return "\n".join(translated)
    except Exception:
        return None


NO_KNOWN = (frozenset(), frozenset())


def new_stats() -> dict:
    return {"held_count": 0, "excluded_count": 0, "skipped_count": 0, "coverage_limited": False}


def merge_source_reports(previous: list, current: list) -> list:
    """공식(일 1회)·외부(매시간) 수집이 같은 목록을 나눠 쓴다. 같은 id는 제자리 교체, 새 id는 뒤에 붙여 순서를 안정시킨다.
    not_configured는 이번에 실제 점검하지 않았으므로 이전 checked_at·last_success_at을 그대로 보존하고,
    ok/partial은 last_success_at을 이번 checked_at으로 갱신하며, failed는 last_success_at을 이전 값으로 보존한다."""
    prev_by_id = {s.get("id"): s for s in previous if isinstance(s, dict)}
    resolved = []
    for s in current:
        if not isinstance(s, dict):
            continue
        prev = prev_by_id.get(s.get("id")) or {}
        entry = dict(s)
        if entry.get("status") == "not_configured":
            entry["checked_at"] = prev.get("checked_at")
            entry["last_success_at"] = prev.get("last_success_at")
        elif entry.get("status") in ("ok", "partial"):
            entry["last_success_at"] = entry.get("checked_at")
        else:
            entry["last_success_at"] = prev.get("last_success_at")
        resolved.append(entry)
    by_id = {e.get("id"): e for e in resolved}
    merged = [by_id.pop(s.get("id"), s) for s in previous if isinstance(s, dict)]
    return merged + [e for e in resolved if e.get("id") in by_id]


def news_status(sources: list) -> str:
    active = [s for s in sources if isinstance(s, dict) and s.get("status") != "not_configured"]
    if not active:
        return "not_collected"
    failed = [s for s in active if s.get("status") == "failed"]
    if len(failed) == len(active):
        return "failed"
    if failed or any((s.get("held_count") or 0) > 0 for s in active):
        return "partial"
    return "ok"


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


def make_candidate(title: str, source_id: str, source_name: str, canonical_url: str, summary_raw: str, date_fields: dict, article_html: str | None = None) -> dict:
    source_summary = clean_html_text(summary_raw)[:SUMMARY_MAX]
    candidate = {
        "id": url_id(canonical_url),
        "title": title,
        "source_id": source_id,
        "source_name": source_name,
        "source_url": canonical_url,
        "source_summary": source_summary,
        "why_it_matters": build_beginner_explanation(title, source_id, source_summary),
        "why_it_matters_provenance": "automatic",
        "fetched_at": datetime.now(KST).isoformat(timespec="seconds"),
        **date_fields,
    }
    # 공식 원문만으로 확인된 새 모델 출시는 독립 매체 수와 무관하게 높음. 신규 후보에만 붙고 기존 기사는 merge_archive가 건드리지 않는다.
    if source_id in OFFICIAL_NEWS_SOURCE_IDS and is_model_launch(title, canonical_url):
        candidate["importance"] = "high"
    release_title = translated_release_title(title, source_id)
    if release_title:
        candidate["title_ko"] = release_title
    elif needs_korean_translation(title):
        candidate["title_ko"] = translate_to_korean(title)
    if needs_korean_translation(source_summary):
        candidate["source_summary_ko"] = translate_to_korean(source_summary)
    if source_id not in RELEASE_SOURCE_IDS:
        full_summary = build_full_text_summary_ko(canonical_url, source_id, prefetched_html=article_html)
        if full_summary:
            candidate["source_summary_ko"] = full_summary
            candidate["source_summary_provenance"] = "article_full_text_3line"
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
            article["why_it_matters_provenance"] = "automatic"
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


def parse_release_page(releases: list, owner_repo: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple, candidates: list, stats: dict, archive_by_url: dict = None) -> bool:
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
            # 기존 archive의 release 기사 중 release_notes_ko가 없는 항목 보강
            if archive_by_url:
                target = archive_by_url.get(canonical_url) or archive_by_url.get(url_id(canonical_url))
                if target is not None and target.get("release_notes_ko") is None:
                    target["release_notes_ko"] = build_release_notes_ko(rel.get("body") or "")
            continue

        cand = make_candidate(title, source_id, source_name, canonical_url, rel.get("body") or "", date_fields)
        cand["release_notes_ko"] = build_release_notes_ko(rel.get("body") or "")
        candidates.append(cand)
    return reached_start


def parse_github_releases(owner_repo: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN, archive_by_url: dict = None) -> tuple[list[dict], dict]:
    candidates = []
    stats = new_stats()
    stats["coverage_limited"] = True  # 60일 시작 또는 목록 끝에 닿으면 해제
    token = os.environ.get("GITHUB_TOKEN")
    headers = {"Authorization": f"Bearer {token}"} if token else None
    for page in range(1, MAX_RELEASE_PAGES + 1):
        api_url = f"https://api.github.com/repos/{owner_repo}/releases?per_page={RELEASES_PER_PAGE}&page={page}"
        status, _, body = fetch_url(api_url, max_bytes=RELEASES_MAX_BYTES, extra_headers=headers)
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
        if parse_release_page(releases, owner_repo, source_id, source_name, window_start, window_end, known, candidates, stats, archive_by_url=archive_by_url):
            stats["coverage_limited"] = False
            break
    return candidates, stats


MONTH_MAP = {
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
}


def build_grok_release_notes_ko(title: str, descriptions: list[str]) -> dict[str, str]:
    summary_en = build_release_summary_en(descriptions)
    if not summary_en:
        return {}
    if needs_korean_translation(summary_en):
        summary_ko = translate_to_korean(summary_en)
    else:
        summary_ko = summary_en
    is_chore = bool(re.search(r"(?i)\b(retirement|deprecation|deprecated)\b", title))
    cat = "chores" if is_chore else "new_features"
    return {cat: summary_ko}


class GrokReleaseParser(HTMLParser):
    def __init__(self, window_end: datetime):
        super().__init__()
        self.window_end = window_end
        self.current_year = window_end.astimezone(KST).year
        self.current_month = None
        self.current_date = None
        self.main_depth = 0
        self.ignore_depth = 0
        self.current_tag = None
        self.text_parts = []
        self.item_title = ""
        self.item_h3_id = ""
        self.item_date = None
        self.item_descriptions = []
        self.raw_items = []
        self.ignored_tags = {"script", "style", "noscript"}

    def handle_starttag(self, tag, attrs):
        t = tag.lower()
        if t in self.ignored_tags:
            self.ignore_depth += 1
            return
        if t == "main":
            self.main_depth += 1
            return
        if self.main_depth == 0 or self.ignore_depth > 0:
            return

        if t == "h2":
            self.current_tag = "h2"
            self.text_parts = []
        elif t == "h3":
            self.flush_item()
            self.current_tag = "h3"
            self.text_parts = []
            attr_dict = dict(attrs)
            self.item_h3_id = attr_dict.get("id") or ""
            self.item_date = self.current_date
        elif t in ("p", "li"):
            if self.item_h3_id or self.item_title:
                self.current_tag = t
                self.text_parts = []
        elif t == "div":
            self.current_tag = "div"
            self.text_parts = []

    def handle_endtag(self, tag):
        t = tag.lower()
        if t in self.ignored_tags:
            if self.ignore_depth > 0:
                self.ignore_depth -= 1
            return
        if t == "main":
            if self.main_depth > 0:
                self.main_depth -= 1
            self.flush_item()
            return
        if self.main_depth == 0 or self.ignore_depth > 0:
            return

        if t == "h2" and self.current_tag == "h2":
            text = clean_html_text("".join(self.text_parts)).strip()
            ym = re.search(r"\b(20\d\d)\b", text)
            if ym:
                self.current_year = int(ym.group(1))
            mm = re.search(r"(?i)\b(january|february|march|april|may|june|july|august|september|october|november|december)\b", text)
            if mm:
                self.current_month = MONTH_MAP[mm.group(1).lower()]
            self.current_tag = None
            self.text_parts = []
        elif t == "div" and self.current_tag == "div":
            text = clean_html_text("".join(self.text_parts)).strip()
            parsed = self.parse_date_text(text)
            if parsed:
                self.current_date = parsed
                if (self.item_h3_id or self.item_title) and self.item_date is None:
                    self.item_date = parsed
            self.current_tag = None
            self.text_parts = []
        elif t == "h3" and self.current_tag == "h3":
            self.item_title = clean_html_text("".join(self.text_parts)).strip()
            self.current_tag = None
            self.text_parts = []
        elif t in ("p", "li") and self.current_tag == t:
            desc = clean_html_text("".join(self.text_parts)).strip()
            if desc:
                self.item_descriptions.append(desc)
            self.current_tag = None
            self.text_parts = []

    def handle_data(self, data):
        if self.ignore_depth > 0 or self.main_depth == 0:
            return
        if self.current_tag is not None:
            self.text_parts.append(data)

    def parse_date_text(self, text: str) -> datetime | None:
        if not text:
            return None
        m = re.match(r"(?i)^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?$", text)
        if m:
            month = MONTH_MAP[m.group(1).lower()]
            day = int(m.group(2))
            year = int(m.group(3)) if m.group(3) else self.current_year
            try:
                return datetime(year, month, day)
            except ValueError:
                return None
        m_day = re.match(r"^(\d{1,2})(?:st|nd|rd|th)?$", text)
        if m_day and self.current_month:
            day = int(m_day.group(1))
            try:
                return datetime(self.current_year, self.current_month, day)
            except ValueError:
                return None
        m_rev = re.match(r"(?i)^(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:\s*,?\s*(\d{4}))?$", text)
        if m_rev:
            day = int(m_rev.group(1))
            month = MONTH_MAP[m_rev.group(2).lower()]
            year = int(m_rev.group(3)) if m_rev.group(3) else self.current_year
            try:
                return datetime(year, month, day)
            except ValueError:
                return None
        m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})$", text)
        if m_iso:
            try:
                return datetime(int(m_iso.group(1)), int(m_iso.group(2)), int(m_iso.group(3)))
            except ValueError:
                return None
        return None

    def flush_item(self):
        if self.item_h3_id or self.item_title:
            self.raw_items.append({
                "title": self.item_title,
                "h3_id": self.item_h3_id,
                "date": self.item_date,
                "descriptions": list(self.item_descriptions),
            })
        self.item_title = ""
        self.item_h3_id = ""
        self.item_date = None
        self.item_descriptions = []

    def close(self):
        self.flush_item()
        super().close()


def parse_xai_releases(html_bytes: bytes, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN, archive_by_url: dict = None) -> tuple[list[dict], dict]:
    candidates = []
    stats = new_stats()
    reached_start = False

    html_text = html_bytes.decode("utf-8", errors="replace")
    parser = GrokReleaseParser(window_end)
    if "<main" not in html_text.lower():
        parser.main_depth = 1
    parser.feed(html_text)
    parser.close()

    if not parser.raw_items:
        raise RuntimeError(f"{source_name}: 릴리스 항목을 추출할 수 없습니다 (형식 변경 의심).")

    for item in parser.raw_items:
        title = item["title"].strip()
        h3_id = item["h3_id"].strip()
        date = item["date"]
        descriptions = item["descriptions"]

        if not title or not h3_id or date is None or not descriptions:
            stats["held_count"] += 1
            continue

        item_url = f"https://docs.x.ai/developers/release-notes#{h3_id}"
        try:
            validate_url(item_url)
        except ValueError:
            stats["held_count"] += 1
            continue

        state, date_fields = classify_date(date, window_start, window_end)
        if state == "old":
            reached_start = True
            continue
        if state == "future":
            stats["excluded_count"] += 1
            continue

        canonical_url = canonicalize_url(item_url)
        if url_id(canonical_url) in known[0] or canonical_url in known[1]:
            stats["skipped_count"] += 1
            if archive_by_url:
                target = archive_by_url.get(canonical_url) or archive_by_url.get(url_id(canonical_url))
                if target is not None and target.get("release_notes_ko") is None:
                    target["release_notes_ko"] = build_grok_release_notes_ko(title, descriptions)
            continue

        try:
            cand = make_candidate(title, source_id, source_name, canonical_url, "\n".join(descriptions), date_fields)
            cand["release_notes_ko"] = build_grok_release_notes_ko(title, descriptions)
        except RuntimeError as error:
            stats["held_count"] += 1
            stats.setdefault("held_reasons", []).append(f"한국어 번역 실패: {error}")
            continue
        candidates.append(cand)

    stats["coverage_limited"] = not reached_start
    return candidates, stats


def parse_html_news(index_url: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime, known: tuple = NO_KNOWN, old_urls: set = None, article_path_prefix: str = "/news/") -> tuple[list[dict], dict]:
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
    unrecognized_model_links = []
    for raw in raw_links:
        joined = urllib.parse.urljoin(index_url, raw)
        p = urllib.parse.urlsplit(joined)
        if (p.hostname or "").lower() != base_host:
            continue
        clean_path = p.path.rstrip("/")
        is_news = clean_path != article_path_prefix.rstrip("/") and clean_path.startswith(article_path_prefix)
        if is_news or (source_id == "anthropic-news" and MODEL_SLUG_RE.match(clean_path)):
            c_url = canonicalize_url(joined)
            if c_url not in seen:
                seen.add(c_url)
                article_urls.append(c_url)
        elif source_id == "anthropic-news" and MODEL_LINK_RE.match(clean_path) and clean_path not in unrecognized_model_links:
            unrecognized_model_links.append(clean_path)

    if not article_urls:
        raise RuntimeError(f"{source_name}: HTML 기사 목록을 추출할 수 없습니다 (형식 변경 의심).")

    # 목록 카드 <a href=...>…<time>Sep 1, 2026</time>…</a>의 공식 날짜를 URL별로 보관. 원문에 정확한 일자가 없을 때만 fallback(정밀도 day).
    index_dates = {}
    for href, inner in re.findall(r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>([\s\S]*?)</a>', html_text, re.I):
        t = re.search(r'<time\b[^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*</time>', inner)
        if not t:
            continue
        for fmt in ("%b %d, %Y", "%B %d, %Y"):
            try:
                index_dates.setdefault(canonicalize_url(urllib.parse.urljoin(index_url, href)), datetime.strptime(t.group(1), fmt).strftime("%Y-%m-%d"))
                break
            except ValueError:
                continue

    # 모델 전용 링크처럼 보이는데 수집 규칙에 안 걸리면 count=0을 정상으로 오인하지 않도록 보류로 드러낸다.
    if unrecognized_model_links:
        stats["held_count"] += len(unrecognized_model_links)
        stats["unrecognized_model_links"] = unrecognized_model_links

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
        title = re.sub(r'\s*[\-|–—\\/]\s*(?:Anthropic|xAI|claude\.dev).*$', '', title, flags=re.I).strip()

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

        if not date_str and source_id == "anthropic-news" and MODEL_SLUG_RE.match(urllib.parse.urlsplit(art_url).path.rstrip("/")):
            # 모델 발표 랜딩은 발행 날짜를 <p class="eyebrow">September 22, 2026</p>로 표시한다.
            m = re.search(r'<p\b[^>]*class=["\'][^"\']*\beyebrow\b[^"\']*["\'][^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*</p>', art_html)
            if m:
                try:
                    date_str = datetime.strptime(m.group(1), "%B %d, %Y").strftime("%Y-%m-%d")
                except ValueError:
                    pass

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

        if not date_str:
            # 원문에 "September 2026"처럼 월만 있는 경우: 추측하지 않고 목록 카드의 공식 <time> 날짜를 쓴다.
            date_str = index_dates.get(art_url)

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

        candidates.append(make_candidate(title, source_id, source_name, art_url, desc_m.group(1) if desc_m else "", date_fields, article_html=art_html))

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

    archive_release_lookup = {}
    for a in today["articles"]:
        if isinstance(a, dict) and a.get("source_id") in RELEASE_SOURCE_IDS:
            if "source_url" in a:
                archive_release_lookup[canonicalize_url(a["source_url"])] = a
            if "id" in a:
                archive_release_lookup[a["id"]] = a
    releases_missing_before = sum(
        1 for a in today["articles"]
        if isinstance(a, dict) and a.get("source_id") in RELEASE_SOURCE_IDS and a.get("release_notes_ko") is None
    )

    sources_def = [
        {"id": "openai-news", "name": "OpenAI News", "url": "https://openai.com/news/rss.xml", "type": "rss"},
        {"id": "google-ai", "name": "Google AI", "url": "https://blog.google/innovation-and-ai/technology/ai/rss/", "type": "rss"},
        {"id": "codex-releases", "name": "Codex Releases", "url": "https://github.com/openai/codex/releases", "type": "releases", "repo": "openai/codex"},
        {"id": "claude-releases", "name": "Claude Code Releases", "url": "https://github.com/anthropics/claude-code/releases", "type": "releases", "repo": "anthropics/claude-code"},
        {"id": "gemini-releases", "name": "Gemini CLI Releases", "url": "https://github.com/google-gemini/gemini-cli/releases", "type": "releases", "repo": "google-gemini/gemini-cli"},
        {"id": "grok-releases", "name": "Grok Releases", "url": "https://docs.x.ai/developers/release-notes", "type": "xai_releases"},
        {"id": "anthropic-news", "name": "Anthropic News", "url": "https://www.anthropic.com/news", "type": "html"},
        {"id": "xai-news", "name": "xAI News", "url": "https://x.ai/news", "type": "html"},
        {"id": "claude-dev-blog", "name": "Claude.dev Blog", "url": "https://claude.dev/", "type": "html", "path_prefix": "/blog/"},
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
                items, stats = parse_github_releases(sdef["repo"], sid, sname, window_start, window_end, known, archive_by_url=archive_release_lookup)
            elif stype == "xai_releases":
                status, headers, body = fetch_url(surl)
                if status != 200:
                    raise RuntimeError(f"HTTP {status}: {surl}")
                ctype = headers.get("content-type", "")
                if "text/html" not in ctype and not body.lstrip().startswith((b"<!DOCTYPE", b"<html")):
                    raise RuntimeError(f"예상치 못한 Content-Type: {ctype}")
                items, stats = parse_xai_releases(body, sid, sname, window_start, window_end, known, archive_by_url=archive_release_lookup)
            elif stype == "html":
                old_urls = set(news_cache.get(sid, {}).get("old_urls", []))
                items, stats = parse_html_news(surl, sid, sname, window_start, window_end, known, old_urls, article_path_prefix=sdef.get("path_prefix", "/news/"))
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
            "checked_at": collected_at,
            **stats
        }
        if error_msg:
            source_report["error"] = error_msg

        sources_health.append(source_report)
        all_candidates.extend(items)

    releases_missing_after = sum(
        1 for a in today["articles"]
        if isinstance(a, dict) and a.get("source_id") in RELEASE_SOURCE_IDS and a.get("release_notes_ko") is None
    )
    releases_enriched = (releases_missing_after < releases_missing_before)

    # archive 및 동일 실행 내부의 id/정규화 URL 중복을 제거하며 새 항목만 누적
    candidates_list, merged_changed = merge_archive(today, all_candidates)
    archive_changed = explanations_changed or merged_changed or releases_enriched
    candidates_list.sort(key=article_sort_key)
    if archive_changed:
        today.update(edition_date=edition_date, window_start=window_start.isoformat(),
                     window_end=window_end.isoformat(), collected_at=collected_at)
        write_json(TODAY_PATH, today)

    official_status = news_status(sources_health)

    # 공식(비릴리스) 출처만의 실행별 집계. RELEASE_SOURCE_IDS는 제외한다(공식 뉴스 지표가 아님).
    official_news_sources = [s for s in sources_health if s["id"] not in RELEASE_SOURCE_IDS]
    official_run = {
        "collected_at": collected_at,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "candidate_count": sum(s["count"] for s in official_news_sources),
        "published_count": sum(1 for c in candidates_list if c["source_id"] not in RELEASE_SOURCE_IDS),
        "held_item_count": sum(s["held_count"] for s in official_news_sources),
        "failed_source_count": sum(1 for s in official_news_sources if s["status"] == "failed"),
        "checked_source_count": sum(1 for s in official_news_sources if s["status"] != "not_configured"),
    }

    # Save candidates. 매시간 외부 수집의 events·출처 보고는 보존한다.
    previous_candidates = read_json(CANDIDATES_PATH)
    candidates_data = {
        **previous_candidates,
        "collected_at": collected_at,
        "window_start": window_start.isoformat(),
        "window_end": window_end.isoformat(),
        "edition_date": edition_date,
        "sources": merge_source_reports(previous_candidates.get("sources") or [], sources_health),
        "new_count": len(candidates_list),
        "archive_count": len(today["articles"]),
        "candidates": candidates_list,
        "official_run": official_run,
    }
    write_json(CANDIDATES_PATH, candidates_data)

    # Update content health (news section only)
    current_health = read_json(HEALTH_PATH)
    merged_sources = merge_source_reports((current_health.get("news") or {}).get("sources") or [], sources_health)
    current_health["news"] = {
        **(current_health.get("news") or {}),
        "checked_at": collected_at,
        "status": news_status(merged_sources),
        "candidate_count": len(candidates_list),
        "archive_count": len(today["articles"]),
        "sources": merged_sources
    }
    if "documents" not in current_health:
        current_health["documents"] = {"checked_at": None, "sources": []}
    write_json(HEALTH_PATH, current_health)

    # Update source cache
    source_cache["updated_at"] = collected_at
    write_json(SOURCE_CACHE_PATH, source_cache)

    print(f"[뉴스 수집 완료] 상태: {official_status}, 최근 {WINDOW_DAYS}일 신규: {len(candidates_list)}건, archive: {len(today['articles'])}건, 실패 출처: {failed_sources}/{len(sources_def)}")
    for s in sources_health:
        info = f"  - {s['name']}: {s['status']} (신규 {s['count']}건, 기존 건너뜀 {s['skipped_count']}건, 보류 {s['held_count']}건)"
        if s["coverage_limited"]:
            info += " [출처 제공 범위가 60일에 못 미침]"
        if s.get("unrecognized_model_links"):
            info += f" [수집 규칙에 없는 모델 링크: {', '.join(s['unrecognized_model_links'])}]"
        if "error" in s:
            info += f" [오류: {s['error']}]"
        print(info)

    if official_status == "failed":
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
    if failed_due:
        print(f"[문서 점검 실패] {failed_due}/{total_due}개 점검 대상 출처에서 오류가 발생했습니다.", file=sys.stderr)
        return 1
    return 0


def backfill_summaries(days: int = 3) -> int:
    """최근 N일(기본/상한 3일) 발행 기사 중 편집자 summary가 없는 기사의 source_summary_ko를 원문 3줄 요약으로 갱신한다.
    release, 오래된 기사, 편집자 summary는 건드리지 않는다. 실패한 기사는 오류를 출력하고 기존 설명을 유지한다."""
    days = min(max(1, days), 3)
    now_kst = datetime.now(KST)
    window_start = now_kst - timedelta(hours=24 * days)

    today = read_json(TODAY_PATH)
    articles = today.get("articles")
    if not isinstance(articles, list):
        raise ValueError("data/today.json의 articles가 배열이 아닙니다.")

    checked = updated = failed = 0
    for article in articles:
        if not isinstance(article, dict) or article.get("source_id") in RELEASE_SOURCE_IDS:
            continue
        if str(article.get("summary") or "").strip():
            continue  # 편집자 요약 보존
        if article.get("source_summary_provenance") == "article_full_text_3line":
            continue  # 이미 검토한 3줄 요약은 재수집 시 덮어쓰지 않는다

        published = None
        if article.get("published_at"):
            published = parse_iso(article["published_at"])
        elif article.get("published_on"):
            try:
                published = datetime.strptime(article["published_on"], "%Y-%m-%d").replace(tzinfo=KST)
            except ValueError:
                published = None
        if published is None or published < window_start:
            continue

        source_url = article.get("source_url")
        source_id = article.get("source_id")
        if not isinstance(source_url, str) or not source_url or not isinstance(source_id, str) or not source_id:
            continue

        checked += 1
        summary = build_full_text_summary_ko(source_url, source_id)
        if not summary:
            print(f"[backfill-summaries 실패] source_id={source_id}: 본문에서 3줄 요약을 만들 수 없습니다. 기존 설명을 유지합니다.", file=sys.stderr)
            failed += 1
            continue
        if article.get("source_summary_ko") == summary and article.get("source_summary_provenance") == "article_full_text_3line":
            continue  # 동일 결과면 파일을 건드리지 않는다 (멱등)
        article["source_summary_ko"] = summary
        article["source_summary_provenance"] = "article_full_text_3line"
        updated += 1

    if updated:
        write_json(TODAY_PATH, today)

    print(f"[backfill-summaries 완료] 대상일수: {days}, 점검 {checked}건, 갱신 {updated}건, 실패 {failed}건")
    return 0


def main():
    parser = argparse.ArgumentParser(description="AgentTutor 뉴스 및 문서 출처 수집·점검 도구")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("news", help="최근 60일 뉴스를 수집해 archive(data/today.json)에 누적하고 헬스 정보를 갱신합니다.")

    doc_parser = subparsers.add_parser("documents", help="학습 자료 출처의 변경 사항을 점검합니다.")
    doc_parser.add_argument("--force", action="store_true", help="점검 주기와 관계없이 모든 출처를 강제 점검합니다.")

    backfill_parser = subparsers.add_parser("backfill-summaries", help="최근 발행 기사의 출처 설명을 원문 3줄 요약으로 갱신합니다.")
    backfill_parser.add_argument("--days", type=int, default=3, help="최근 N일 이내 발행 기사만 대상으로 합니다 (기본/상한 3).")

    args = parser.parse_args()
    if args.command == "news":
        sys.exit(collect_news())
    elif args.command == "documents":
        sys.exit(collect_documents(force=args.force))
    elif args.command == "backfill-summaries":
        sys.exit(backfill_summaries(args.days))


if __name__ == "__main__":
    main()
