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
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def validate_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme.lower() != "https":
        raise ValueError(f"HTTPS 프로토콜만 허용됩니다: {url}")
    if parsed.username or parsed.password:
        raise ValueError(f"사용자 인증 정보가 포함된 URL은 거부됩니다: {url}")
    if parsed.port and parsed.port != 443:
        raise ValueError(f"비정상 포트는 허용되지 않습니다: {url}")
    hostname = (parsed.hostname or "").lower()
    if hostname not in ALLOWED_HOSTS:
        raise ValueError(f"허용되지 않은 호스트입니다: {hostname}")


KNOWN_TRACKING_PARAMS = {"ref", "source", "fbclid", "gclid", "yclid", "_ga", "mc_cid", "mc_eid"}


def canonicalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    q_pairs = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    filtered = [(k, v) for k, v in q_pairs if not (k.lower().startswith("utm_") or k.lower() in KNOWN_TRACKING_PARAMS)]
    new_query = urllib.parse.urlencode(filtered)
    path = parsed.path.rstrip("/") if parsed.path != "/" else "/"
    return urllib.parse.urlunsplit((parsed.scheme.lower(), (parsed.hostname or "").lower(), path, new_query, ""))


def fetch_url(url: str, etag: str = None, last_modified: str = None, max_retries: int = 2) -> tuple[int, dict, bytes]:
    validate_url(url)
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; AgentTutor/0.2; +https://hanstree-agenttutor-jgwu.vercel.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml,application/atom+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    }
    if etag:
        headers["If-None-Match"] = etag
    if last_modified:
        headers["If-Modified-Since"] = last_modified

    opener = urllib.request.build_opener(SafeRedirectHandler())
    request = urllib.request.Request(url, headers=headers)

    attempts = 0
    while True:
        attempts += 1
        try:
            with opener.open(request, timeout=TIMEOUT) as response:
                status = response.status
                resp_headers = {k.lower(): v for k, v in response.headers.items()}
                body = response.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    raise ValueError(f"응답 크기가 최대 허용치(3MB)를 초과했습니다: {url}")
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


def parse_rss_feed(xml_bytes: bytes, source_id: str, source_name: str, window_start: datetime, window_end: datetime) -> tuple[list[dict], int, int]:
    candidates = []
    held_count = 0
    excluded_count = 0
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
            held_count += 1
            continue

        try:
            validate_url(raw_url)
        except ValueError:
            held_count += 1
            continue

        try:
            pub_dt = parsedate_to_datetime(pubdate_str)
            if pub_dt.tzinfo is None:
                held_count += 1
                continue
        except Exception:
            held_count += 1
            continue

        if pub_dt > window_end:
            excluded_count += 1
            continue
        if pub_dt < window_start:
            continue

        canonical_url = canonicalize_url(raw_url)
        cid = hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()[:16]
        evidence = clean_html_text(desc_raw)[:2000]

        candidates.append({
            "id": cid,
            "title": title,
            "source_id": source_id,
            "source_name": source_name,
            "source_url": canonical_url,
            "published_at": pub_dt.astimezone(timezone.utc).isoformat(),
            "evidence": evidence
        })

    return candidates, held_count, excluded_count


def parse_atom_releases(xml_bytes: bytes, source_id: str, source_name: str, owner_repo: str, window_start: datetime, window_end: datetime) -> tuple[list[dict], int, int]:
    candidates = []
    held_count = 0
    excluded_count = 0
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError as error:
        raise RuntimeError(f"Atom XML 파싱 실패: {error}")

    if root.tag != "{http://www.w3.org/2005/Atom}feed":
        raise RuntimeError(f"유효한 Atom 피드 루트 요소가 아닙니다: {root.tag}")

    entries = root.findall("{http://www.w3.org/2005/Atom}entry")
    if not entries:
        raise RuntimeError("Atom 항목이 없습니다. 피드 구조를 확인해야 합니다.")
    # ponytail: 최신 10개 피드 항목만 확인; 누락 구간이 필요해지면 Releases API 페이지 수집으로 확장.
    for entry in entries[:10]:
        title_el = entry.find("{http://www.w3.org/2005/Atom}title")
        link_el = entry.find("{http://www.w3.org/2005/Atom}link")
        updated_el = entry.find("{http://www.w3.org/2005/Atom}updated")
        title = (title_el.text or "").strip() if title_el is not None else ""
        href = link_el.get("href", "").strip() if link_el is not None else ""

        if not title or not href:
            held_count += 1
            continue

        if href.startswith("/"):
            href = f"https://github.com{href}"

        try:
            validate_url(href)
        except ValueError:
            held_count += 1
            continue

        p_href = urllib.parse.urlsplit(href)
        if (p_href.hostname or "").lower() != "github.com":
            held_count += 1
            continue

        expected_prefix = f"/{owner_repo}/releases/tag/"
        if not p_href.path.startswith(expected_prefix):
            held_count += 1
            continue

        tag = p_href.path[len(expected_prefix):].split("/")[0].split("?")[0].split("#")[0]
        if not tag:
            held_count += 1
            continue

        if re.search(r'(?i)\b(alpha|beta|rc|preview|nightly)\b|[.-](alpha|beta|rc|preview|nightly)', title) or \
           re.search(r'(?i)\b(alpha|beta|rc|preview|nightly)\b|[.-](alpha|beta|rc|preview|nightly)', tag):
            excluded_count += 1
            continue

        # Filter obviously old Atom updated before API fetch to reduce quota (don't treat updated as published_at)
        if updated_el is not None and updated_el.text:
            try:
                upd_dt = datetime.fromisoformat(updated_el.text.strip().replace("Z", "+00:00"))
                if upd_dt.tzinfo is not None and upd_dt < window_start - timedelta(days=2):
                    continue
            except Exception:
                pass

        # Fetch official release metadata from GitHub API
        api_url = f"https://api.github.com/repos/{owner_repo}/releases/tags/{tag}"
        try:
            status, _, body = fetch_url(api_url)
            if status != 200:
                held_count += 1
                continue
            gh_data = json.loads(body.decode("utf-8"))
        except Exception:
            held_count += 1
            continue

        if gh_data.get("prerelease") or gh_data.get("draft"):
            excluded_count += 1
            continue

        pub_str = gh_data.get("published_at")
        if not pub_str:
            held_count += 1
            continue

        try:
            pub_dt = datetime.fromisoformat(pub_str.replace("Z", "+00:00"))
            if pub_dt.tzinfo is None:
                held_count += 1
                continue
        except Exception:
            held_count += 1
            continue

        if pub_dt > window_end:
            excluded_count += 1
            continue
        if pub_dt < window_start:
            continue

        canonical_url = canonicalize_url(href)
        cid = hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()[:16]
        evidence = clean_html_text(gh_data.get("body") or "")[:2000]

        candidates.append({
            "id": cid,
            "title": title,
            "source_id": source_id,
            "source_name": source_name,
            "source_url": canonical_url,
            "published_at": pub_dt.astimezone(timezone.utc).isoformat(),
            "evidence": evidence
        })

    return candidates, held_count, excluded_count


def parse_html_news(index_url: str, source_id: str, source_name: str, window_start: datetime, window_end: datetime) -> tuple[list[dict], int, int]:
    candidates = []
    held_count = 0
    excluded_count = 0

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
                # ponytail: 출처당 8개 기사로 요청량 제한; 누락이 확인되면 사이트별 페이지 수집 추가.
                if len(article_urls) >= 8:
                    break

    if not article_urls:
        raise RuntimeError(f"{source_name}: HTML 기사 목록을 추출할 수 없습니다 (형식 변경 의심).")

    for art_url in article_urls:
        try:
            validate_url(art_url)
        except ValueError:
            held_count += 1
            continue

        try:
            art_status, _, art_body = fetch_url(art_url)
            if art_status != 200:
                held_count += 1
                continue
            art_html = art_body.decode("utf-8", errors="replace")
        except Exception:
            held_count += 1
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

        if not date_str or not title:
            held_count += 1
            continue

        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', date_str):
            try:
                d_only = datetime.strptime(date_str, "%Y-%m-%d").date()
                if d_only < window_start.date() - timedelta(days=1):
                    excluded_count += 1
                    continue
            except Exception:
                pass
            held_count += 1
            continue

        try:
            pub_dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
            if pub_dt.tzinfo is None:
                held_count += 1
                continue
        except Exception:
            held_count += 1
            continue

        if pub_dt > window_end:
            excluded_count += 1
            continue
        if pub_dt < window_start:
            continue

        cid = hashlib.sha256(art_url.encode("utf-8")).hexdigest()[:16]
        desc_m = re.search(r'<meta\b[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)
        if not desc_m:
            desc_m = re.search(r'<meta\b[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']', art_html, re.I)
        evidence = clean_html_text(desc_m.group(1) if desc_m else "")[:2000]

        candidates.append({
            "id": cid,
            "title": title,
            "source_id": source_id,
            "source_name": source_name,
            "source_url": art_url,
            "published_at": pub_dt.astimezone(timezone.utc).isoformat(),
            "evidence": evidence
        })

    return candidates, held_count, excluded_count


def collect_news(days: int = 1) -> int:
    if days not in (1, 7):
        raise ValueError("수집 기간(days)은 1 또는 7만 허용됩니다.")
    now_kst = datetime.now(KST)
    window_end = now_kst
    window_start = now_kst - timedelta(days=days)
    edition_date = window_end.strftime("%Y-%m-%d")
    collected_at = now_kst.isoformat()

    source_cache = read_json(SOURCE_CACHE_PATH)
    news_cache = source_cache.setdefault("news", {})

    sources_def = [
        {"id": "openai-news", "name": "OpenAI News", "url": "https://openai.com/news/rss.xml", "type": "rss"},
        {"id": "google-ai", "name": "Google AI", "url": "https://blog.google/innovation-and-ai/technology/ai/rss/", "type": "rss"},
        {"id": "codex-releases", "name": "Codex Releases", "url": "https://github.com/openai/codex/releases.atom", "type": "atom", "repo": "openai/codex"},
        {"id": "gemini-releases", "name": "Gemini CLI Releases", "url": "https://github.com/google-gemini/gemini-cli/releases.atom", "type": "atom", "repo": "google-gemini/gemini-cli"},
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
        cached = news_cache.get(sid, {})
        cached_items = cached.get("cached_items", [])

        # news 조건부 요청은 days==1 및 cached.window_days==1일 때만 허용 (7일은 항상 피드 재조회)
        use_conditional = (days == 1) and (cached.get("window_days") == 1) and bool(cached_items) and ("held_count" in cached)
        etag = cached.get("etag") if use_conditional else None
        last_mod = cached.get("last_modified") if use_conditional else None

        items = []
        held_count = 0
        error_msg = None

        try:
            if stype == "rss":
                status, headers, body = fetch_url(surl, etag=etag, last_modified=last_mod)
                if status == 304 and cached_items:
                    held_count = cached["held_count"]
                    for c_item in cached_items:
                        p_dt = datetime.fromisoformat(c_item["published_at"])
                        if window_start <= p_dt <= window_end:
                            items.append(c_item)
                else:
                    items, held_count, _ = parse_rss_feed(body, sid, sname, window_start, window_end)
                    news_cache[sid] = {
                        "etag": headers.get("etag"),
                        "last_modified": headers.get("last-modified"),
                        "last_checked": collected_at,
                        "window_days": days,
                        "held_count": held_count,
                        "cached_items": items
                    }
            elif stype == "atom":
                status, headers, body = fetch_url(surl, etag=etag, last_modified=last_mod)
                if status == 304 and cached_items:
                    held_count = cached["held_count"]
                    for c_item in cached_items:
                        p_dt = datetime.fromisoformat(c_item["published_at"])
                        if window_start <= p_dt <= window_end:
                            items.append(c_item)
                else:
                    items, held_count, _ = parse_atom_releases(body, sid, sname, sdef["repo"], window_start, window_end)
                    news_cache[sid] = {
                        "etag": headers.get("etag"),
                        "last_modified": headers.get("last-modified"),
                        "last_checked": collected_at,
                        "window_days": days,
                        "held_count": held_count,
                        "cached_items": items
                    }
            elif stype == "html":
                items, held_count, _ = parse_html_news(surl, sid, sname, window_start, window_end)
                news_cache[sid] = {
                    "last_checked": collected_at,
                    "window_days": days,
                    "cached_items": items
                }
        except Exception as error:
            error_msg = str(error)
            failed_sources += 1

        if error_msg:
            source_status = "failed"
        elif held_count > 0:
            source_status = "partial"
        else:
            source_status = "ok"

        source_report = {
            "id": sid,
            "name": sname,
            "url": surl,
            "status": source_status,
            "count": len(items),
            "held_count": held_count
        }
        if error_msg:
            source_report["error"] = error_msg

        sources_health.append(source_report)
        all_candidates.extend(items)

    # Deduplicate candidates by ID
    deduped = {}
    for cand in all_candidates:
        if cand["id"] not in deduped:
            deduped[cand["id"]] = cand
    candidates_list = sorted(deduped.values(), key=lambda x: x["published_at"], reverse=True)

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
        "candidates": candidates_list
    }
    write_json(CANDIDATES_PATH, candidates_data)

    # Update content health (news section only)
    current_health = read_json(HEALTH_PATH)
    current_health["news"] = {
        "checked_at": collected_at,
        "status": news_status,
        "candidate_count": len(candidates_list),
        "sources": sources_health
    }
    if "documents" not in current_health:
        current_health["documents"] = {"checked_at": None, "sources": []}
    write_json(HEALTH_PATH, current_health)

    # Update source cache
    source_cache["updated_at"] = collected_at
    write_json(SOURCE_CACHE_PATH, source_cache)

    print(f"[뉴스 수집 완료] 상태: {news_status}, 후보: {len(candidates_list)}건, 실패 출처: {failed_sources}/{len(sources_def)}")
    for s in sources_health:
        info = f"  - {s['name']}: {s['status']} (발견 {s['count']}건, 보류 {s['held_count']}건)"
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

    news_parser = subparsers.add_parser("news", help="최신 뉴스 후보를 수집하고 헬스 정보를 갱신합니다.")
    news_parser.add_argument("--days", type=int, choices=[1, 7], default=1, help="수집 기간 일수 (1 또는 7, 기본값: 1)")

    doc_parser = subparsers.add_parser("documents", help="학습 자료 출처의 변경 사항을 점검합니다.")
    doc_parser.add_argument("--force", action="store_true", help="점검 주기와 관계없이 모든 출처를 강제 점검합니다.")

    args = parser.parse_args()
    if args.command == "news":
        sys.exit(collect_news(days=args.days))
    elif args.command == "documents":
        sys.exit(collect_documents(force=args.force))


if __name__ == "__main__":
    main()
