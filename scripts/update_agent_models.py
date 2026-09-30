#!/usr/bin/env python3
"""매일 06:35 KST, 6개 제공사 공식 카탈로그를 조회해 data/agent-models.json을 갱신한다.

- 기존 collect_content.fetch_url/read_json/write_json(원자적 쓰기, 호스트 허용목록,
  리다이렉트 검증)을 재사용한다.
- 새 모델은 공식 상세 문서에서 정확한 모델 ID가 확인된 경우에만 추가한다.
- 명시적으로 파싱되지 않은 필드는 '공식 미확인'(문자열) 또는 null로 남기고,
  기존 값이나 다른 모델 값을 추론해 채우지 않는다.
"""

from __future__ import annotations

from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collect_content import ContentTextExtractor, ROOT, fetch_url, read_json, write_json  # noqa: E402

DATA_PATH = ROOT / "data" / "agent-models.json"
KST = timezone(timedelta(hours=9))
UNCONFIRMED = "공식 미확인"

ALLOWED_HOSTS = frozenset({
    "developers.openai.com", "platform.claude.com", "ai.google.dev",
    "docs.x.ai", "dev.meta.ai", "api-docs.deepseek.com",
})


def now_kst_str() -> str:
    return datetime.now(KST).isoformat(timespec="seconds")


def today_kst() -> str:
    return datetime.now(KST).strftime("%Y-%m-%d")


_FETCH_CACHE: dict[str, tuple[int, bytes] | None] = {}


def get(url: str) -> tuple[int, bytes] | None:
    """실행(run) 단위로 URL 응답을 캐시해 같은 문서(예: Meta 공유 문서)를
    모델마다 반복 조회하지 않는다."""
    if url in _FETCH_CACHE:
        return _FETCH_CACHE[url]
    try:
        status, _headers, body = fetch_url(
            url, max_retries=1, allowed_hosts=ALLOWED_HOSTS,
            extra_headers={"Accept-Language": "en"},
        )
    except (OSError, ValueError, RuntimeError):
        _FETCH_CACHE[url] = None
        return None
    result = (status, body) if status == 200 and body else None
    _FETCH_CACHE[url] = result
    return result


def text_of(body: bytes) -> str:
    return body.decode("utf-8", errors="replace")


# --------------------------------------------------------------------------
# 필드 파싱 헬퍼: 실패 시 None (기존 값을 유지, 발명하지 않음)
# --------------------------------------------------------------------------

def _num(pattern: str, text: str, group: int = 1, flags: int = 0) -> float | None:
    m = re.search(pattern, text, flags)
    if not m:
        return None
    try:
        return float(m.group(group).replace(",", ""))
    except ValueError:
        return None


def _str(pattern: str, text: str, group: int = 1, flags: int = 0) -> str | None:
    m = re.search(pattern, text, flags)
    return m.group(group).strip() if m else None


def _strip_md(text: str) -> str:
    """파싱용 복사본: [label](url) → label, backtick 제거."""
    return re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', text).replace('`', '')


def _short_tokens(value: str) -> str:
    """'128,000 tokens'/'1M tokens' → '128K'/'1M' (기존 데이터 표기)."""
    v = re.sub(r'(?i)\s*tokens?$', '', value.strip())
    n = re.fullmatch(r'([\d,]+)', v)
    if n:
        count = int(n.group(1).replace(',', ''))
        if count % 1_000_000 == 0:
            return f"{count // 1_000_000}M"
        if count % 1000 == 0:
            return f"{count // 1000}K"
    return v


def _token_counts(value) -> set[int]:
    """'128K'→{128000,131072}, '1M'→{1000000,1048576}, '1,048,576'→{1048576}. 그 외 빈 집합."""
    m = re.fullmatch(r'\s*([\d,]+(?:\.\d+)?)\s*([KM])?\s*(?:tokens?)?\s*', str(value or ''), re.I)
    if not m:
        return set()
    num = float(m.group(1).replace(',', ''))
    unit = (m.group(2) or '').upper()
    if unit == 'K':
        return {int(num * 1000), int(num * 1024)}
    if unit == 'M':
        return {int(num * 1_000_000), int(num * 1_048_576)}
    return {int(num)}


def _norm_name(value) -> str:
    return re.sub(r'[^0-9a-z가-힣]', '', str(value or '').lower())


def _keep_existing_text(old, new) -> bool:
    """기존 값이 한국어이거나(수동 검수), 정규화 시 동일 내용(DeepSeek V4 Pro 0813 vs
    DeepSeek-V4-Pro-0813, 128K vs 128,000)이면 영문/다른 표기로 덮어쓰지 않는다."""
    if old in (None, '', UNCONFIRMED, '공식 미표기'):
        return False
    if re.search(r'[가-힣]', str(old)):
        return True
    if _token_counts(old) & _token_counts(new):
        return True
    return _norm_name(new) != '' and _norm_name(new) in _norm_name(old)


def _merge_sources(target: list[dict] | None, extra: list[dict]) -> list[dict]:
    """URL(.md/끝 슬래시 무시) 기준 중복 없이 추가한다."""
    def key(url): return str(url or '').rstrip('/').removesuffix('.md').rstrip('/')
    out = list(target or [])
    seen = {key(s.get('url')) for s in out}
    for s in extra:
        if key(s.get('url')) not in seen:
            out.append(s)
            seen.add(key(s.get('url')))
    return out


def parse_release_date(text: str) -> str | None:
    """명시적 'Released'/'Launched' 문맥의 날짜만 인정한다.
    knowledge cutoff나 문서 경로에 섞인 일반 YYYY-MM-DD는 릴리스일이 아니므로 무시한다."""
    m = re.search(r'(?:Released|Launched)\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})', text)
    if not m:
        return None
    try:
        dt = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y")
    except ValueError:
        return None
    if dt > datetime.now(KST).replace(tzinfo=None) + timedelta(days=1):
        return None
    return dt.strftime("%Y-%m-%d")


# --------------------------------------------------------------------------
# Claude
# --------------------------------------------------------------------------

def claude_discover() -> dict[str, str] | None:
    r = get("https://platform.claude.com/docs/llms.txt")
    if not r:
        return None
    _status, body = r
    text = text_of(body)
    out: dict[str, str] = {}
    for m in re.finditer(
        r'\(https://platform\.claude\.com/docs/en/models/([a-z0-9-]+)/overview\.md\)', text
    ):
        slug = m.group(1)
        if not re.match(r'^(fable|opus|sonnet|haiku)(-|$)', slug):
            continue
        model_id = slug if slug.startswith("claude-") else f"claude-{slug}"
        out[model_id] = (
            f"https://platform.claude.com/docs/en/models/{slug}/overview.md"
        )
    return out or None


CLAUDE_EFFORT_URL = "https://platform.claude.com/docs/en/build-with-claude/effort.md"
CLAUDE_EFFORT_SOURCE = {"name": "Claude effort 파라미터 문서", "url": CLAUDE_EFFORT_URL}
_CLAUDE_LEVELS = ("low", "medium", "high", "xhigh", "max")


def claude_effort_supported_ids(effort_md: str) -> set[str]:
    """frontmatter featureMetadata.supportedModels 의 정확한 모델 ID 집합."""
    fm = re.match(r'^---\n(.*?)\n---', effort_md, re.S)
    if not fm:
        return set()
    m = re.search(r'supportedModels:\s*(\[[^\]]*\]|(?:\n[ \t]+-[^\n]*)+)', fm.group(1))
    return set(re.findall(r'claude-[a-z0-9-]+', m.group(1))) if m else set()


def claude_effort_levels(effort_md: str, model_name: str) -> list[str]:
    """effort 표: low/medium/high 행은 지원 모델 전체 공통, xhigh/max 행은 허용 모델 이름을
    명시한다. 이름은 전체 일치(Claude Opus 5 ≠ Claude Opus 5.5)만 인정한다."""
    text = _strip_md(effort_md)
    name_re = re.compile(re.escape(model_name.strip()) + r'(?!\w|\.\d)')
    levels: set[str] = set()
    for line in text.splitlines():
        if not line.strip().startswith('|'):
            continue
        cells = [c.strip().strip('*').strip() for c in line.strip().strip('|').split('|')]
        level = cells[0].lower() if cells else ''
        if level in ("low", "medium", "high"):
            levels.add(level)
        elif level in ("xhigh", "max") and name_re.search(line):
            levels.add(level)
    return [lv for lv in _CLAUDE_LEVELS if lv in levels]


def claude_parse(detail_text: str, model_id: str | None = None) -> dict:
    text = _strip_md(detail_text)
    fields: dict = {}
    fields["name"] = _str(r'title:\s*(Claude[^\n]+)', text)
    pinned = _str(r'Model ID:\s*([a-z0-9-]+)', text)
    fields["id"] = pinned
    # 헤더는 pinned ID(claude-haiku-4-5-20251001)지만 본문이 요청 alias를 명시적으로
    # 확인해 줄 때만(… `claude-haiku-4-5` … convenience alias …) 요청 ID를 인정한다.
    if model_id and pinned and pinned != model_id and re.search(
        re.escape(model_id) + r'(?![\w-])[^\n.]*\balias\b', text
    ):
        fields["id"] = model_id
    fields["released_at"] = parse_release_date(text)
    fields["input_cost"] = _num(r'\|\s*Input\s*\|\s*\$([\d.]+)\s*/\s*MTok', text)
    fields["output_cost"] = _num(r'\|\s*Output\s*\|\s*\$([\d.]+)\s*/\s*MTok', text)
    fields["cache_read_cost"] = _num(r'Cache read\s*\|\s*\$([\d.]+)\s*/\s*MTok', text)
    ctx = _str(r'Context window\s*[|:]?\s*([\d,]+\s*[KM]?\s*tokens)', text)
    fields["context_window"] = _short_tokens(ctx) if ctx else None
    max_out = _str(r'Max output\s*[|:]?\s*([\d,]+\s*[KM]?\s*tokens)', text)
    fields["max_output"] = _short_tokens(max_out) if max_out else None

    effort = get(CLAUDE_EFFORT_URL)
    if not effort:
        raise ValueError("Claude effort 문서 조회 실패")
    effort_md = text_of(effort[1])
    if re.search(r'Default effort\s*[|:]?\s*Not supported', text, re.I):
        fields["effort_levels"] = []
        fields["effort_source"] = [CLAUDE_EFFORT_SOURCE]
    elif fields["name"] and {pinned, model_id, fields["id"]} & claude_effort_supported_ids(effort_md):
        levels = claude_effort_levels(effort_md, fields["name"])
        if levels:
            fields["effort_levels"] = levels
            fields["effort_source"] = [CLAUDE_EFFORT_SOURCE]
    return fields


# --------------------------------------------------------------------------
# OpenAI / Codex
# --------------------------------------------------------------------------

CODEX_EXCLUDE_RE = re.compile(r'(?i)audio|image|live|realtime|transcribe|cyber|daybreak|chatlatest')
CODEX_ID_RE = re.compile(r'^gpt-\d+(\.\d+)?(-[a-z]+)?$')


def codex_discover() -> dict[str, str] | None:
    r = get("https://developers.openai.com/api/docs/models.md")
    if not r:
        return None
    text = text_of(r[1])
    out: dict[str, str] = {}
    for m in re.finditer(r'\(/api/docs/models/([a-z0-9.-]+)\.md\)', text):
        model_id = m.group(1)
        if CODEX_EXCLUDE_RE.search(model_id) or not CODEX_ID_RE.match(model_id):
            continue
        out[model_id] = f"https://developers.openai.com/api/docs/models/{model_id}.md"
    return out or None


def codex_parse(detail_text: str, model_id: str | None = None) -> dict:
    fields: dict = {}
    fields["name"] = _str(r'^#\s+(.+)$', detail_text, flags=re.M)
    fields["id"] = _str(r'Model ID:\s*`([^`]+)`', detail_text)
    # 문서 색인 인용구(documentation index)를 건너뛴 첫 설명 blockquote를 취한다.
    fields["key_feature"] = next(
        (q.strip() for q in re.findall(r'^>\s*(.+)$', detail_text, flags=re.M)
         if not re.search(r'(?i)documentation index', q)), None)
    ctx = _num(r'-\s*([\d,]+)\s*context window', detail_text)
    fields["context_window"] = f"{int(ctx):,}" if ctx is not None else None
    max_out = _num(r'-\s*([\d,]+)\s*max output tokens', detail_text)
    fields["max_output"] = f"{int(max_out):,}" if max_out is not None else None
    fields["input_modalities"] = _str(r'Input modalities:\s*([a-z, ]+)', detail_text)
    if fields["input_modalities"] == "text, image":
        fields["input_modalities"] = "텍스트 · 이미지"
    fields["input_cost"] = _num(r'\|\s*Input\s*\|\s*\$([\d.]+)', detail_text)
    fields["output_cost"] = _num(r'\|\s*Output\s*\|\s*\$([\d.]+)', detail_text)
    fields["cache_read_cost"] = _num(r'\|\s*Cached input\s*\|\s*\$([\d.]+)', detail_text)

    # backtick을 벗긴 복사본에서 "reasoning.effort supports …" 문장(첫 마침표까지)만 취한다.
    # 바로 다음 문장 "none and minimal are not supported"는 범위 밖이라 섞이지 않는다.
    support_sentence = _str(r'(?i)\breasoning\.effort\s+supports\s+([^.]*)\.', _strip_md(detail_text))
    if support_sentence:
        found = set(re.findall(r'\b(none|minimal|low|medium|high|xhigh|max)\b', support_sentence.lower()))
        if found:
            fields["effort_levels"] = [lv for lv in ("none", "minimal", "low", "medium", "high", "xhigh", "max")
                                       if lv in found]
    return fields


# --------------------------------------------------------------------------
# Grok
# --------------------------------------------------------------------------

GROK_ID_RE = re.compile(r'^grok-\d+(\.\d+)?$')


def grok_discover() -> dict[str, str] | None:
    """표 첫 열 셀을 정확히 fullmatch한다. '(<128K)' 같은 threshold 표기를 제거한 뒤
    비교해야 grok-4(<128K) 같은 셀이 grok-4.20 등 엉뚱한 id로 오인되지 않는다."""
    r = get("https://docs.x.ai/developers/models.md")
    if not r:
        return None
    text = text_of(r[1])
    out: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith('|'):
            continue
        cells = [c.strip() for c in stripped.strip('|').split('|')]
        if not cells:
            continue
        cell = re.sub(r'\(<[^)]*\)', '', cells[0]).strip()
        cell = cell.strip('`* ')
        if GROK_ID_RE.fullmatch(cell):
            out[cell] = f"https://docs.x.ai/developers/models/{cell}.md"
    return out or None


def grok_parse(detail_text: str, model_id: str | None = None) -> dict:
    fields: dict = {}
    fields["id"] = _str(r'^-\s*\*\*Model name:\*\*\s*`([^`]+)`', detail_text, flags=re.M)
    ctx = _num(r'Context window:\*\*\s*([\d,]+)', detail_text)
    fields["context_window"] = f"{int(ctx):,}" if ctx is not None else None
    fields["input_cost"] = _num(r'\|\s*Input\s*\|\s*\$([\d.]+)', detail_text)
    fields["cache_read_cost"] = _num(r'\|\s*Cached input\s*\|\s*\$([\d.]+)', detail_text)
    fields["output_cost"] = _num(r'\|\s*Output\s*\|\s*\$([\d.]+)', detail_text)
    levels = _str(r'Reasoning efforts \(supported\):\*\*\s*([^\n]+)', detail_text)
    if levels:
        fields["effort_levels"] = re.findall(r'`(\w+)`', levels)
    return fields


# --------------------------------------------------------------------------
# Gemini (stdlib HTMLParser)
# --------------------------------------------------------------------------

GEMINI_ID_RE = re.compile(r'^gemini-\d+(\.\d+)?-(pro|flash|flash-lite)(-preview)?$')


class _HrefCollector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.hrefs: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            for name, value in attrs:
                if name == "href" and value:
                    self.hrefs.append(value)


class _CodeCollector(HTMLParser):
    """<code>/<pre> 텍스트를 모은다 (중첩 pre>code는 바깥 요소 하나로 취급)."""

    def __init__(self):
        super().__init__()
        self.depth = 0
        self.codes: list[str] = []
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in ("code", "pre"):
            if self.depth == 0:
                self._buf = []
            self.depth += 1

    def handle_endtag(self, tag):
        if tag in ("code", "pre") and self.depth:
            self.depth -= 1
            if self.depth == 0:
                self.codes.append("".join(self._buf).strip())

    def handle_data(self, data):
        if self.depth:
            self._buf.append(data)


def gemini_discover() -> dict[str, str] | None:
    """카탈로그 href(/gemini-api/docs/models/<id>) 중 GEMINI_ID_RE에 맞는 id만 채택한다.
    정확한 id 확인은 gemini_parse가 상세 문서의 <code>/<pre>로 수행한다."""
    r = get("https://ai.google.dev/gemini-api/docs/models?hl=en")
    if not r:
        return None
    href_parser = _HrefCollector()
    href_parser.feed(text_of(r[1]))
    out: dict[str, str] = {}
    for href in href_parser.hrefs:
        m = re.search(r'/gemini-api/docs/models/(gemini-[\w.-]+?)(?:[?#].*)?$', href)
        if m and GEMINI_ID_RE.match(m.group(1)):
            out[m.group(1)] = f"https://ai.google.dev/gemini-api/docs/models/{m.group(1)}?hl=en"
    return out or None


GEMINI_THINKING_URL = "https://ai.google.dev/gemini-api/docs/thinking?hl=en"
GEMINI_PRICING_URL = "https://ai.google.dev/gemini-api/docs/pricing?hl=en"
GEMINI_THINKING_SOURCE = {"name": "Gemini thinking 공식 문서", "url": GEMINI_THINKING_URL}
GEMINI_PRICING_SOURCE = {"name": "Gemini 요금 공식 문서", "url": GEMINI_PRICING_URL}
_LEVEL_RE = re.compile(r'\b(minimal|low|medium|high)\b')


def gemini_parse_thinking(html: str, model_id: str) -> dict | None:
    """공유 HTML 표(model | default | levels)에서 해당 모델 행을 찾는다.
    행 없음 → None(알 수 없음). 행은 있는데 level이 안 읽히면 ValueError(형식 변경)."""
    parser = _TableRowCollector()
    parser.feed(html)
    for row in parser.rows:
        if len(row) >= 3 and row[0].strip() == model_id:
            levels = _LEVEL_RE.findall(row[-1].lower())
            if not levels:
                raise ValueError(f"thinking 표에서 {model_id} level을 읽지 못함: {row[-1]!r}")
            out = {"effort_levels": levels}
            default = re.search(r'\((minimal|low|medium|high)\)', row[1].lower())
            if default:
                out["effort_default"] = default.group(1)
            return out
    return None


_FEE_DATE_RE = re.compile(r'(?i)\b(through|until|starting|from)\s+([A-Z][a-z]+ \d{1,2}, \d{4})')


def _gemini_fee(cell: str, as_of: date) -> float:
    """'$0.75 through December 31, 2026. $1.50 starting January 1, 2027. $0.50 per hour...'에서
    as_of 기준 유효한 첫 토큰 요금을 고른다. hour(저장 요금) 구간은 무시, 없으면 ValueError."""
    for seg in re.split(r'(?=\$\s*\d*\.?\d+)', cell)[1:]:
        if re.search(r'(?i)\bhour', seg):
            continue
        amount = float(re.match(r'\$\s*(\d*\.?\d+)', seg).group(1))
        valid = True
        for kind, day in _FEE_DATE_RE.findall(seg):
            d = datetime.strptime(day, "%B %d, %Y").date()
            valid &= as_of <= d if kind.lower() in ("through", "until") else as_of >= d
        if valid:
            return amount
    raise ValueError(f"{as_of} 기준 유효한 요금 없음: {cell!r}")


def gemini_parse_pricing(html: str, model_id: str, as_of: date | None = None) -> dict:
    """<h2 id=model_id> 섹션의 첫 Standard(Free/Paid tier) 표에서 Paid 열(마지막 셀)만 읽는다.
    섹션/표/행이 없으면 ValueError → 호출자가 실패로 보고하고 기존 값을 유지한다."""
    as_of = as_of or datetime.now(KST).date()
    start = re.search(rf'<h2\b[^>]*\bid=["\']{re.escape(model_id)}["\']', html)
    if not start:
        raise ValueError(f"pricing 문서에 {model_id} 섹션 없음")
    end = re.search(r'<h2\b', html[start.end():])
    section = html[start.end(): start.end() + end.start()] if end else html[start.end():]
    rows: list[list[str]] | None = None
    for chunk in re.split(r'(?i)<table\b', section)[1:]:
        parser = _TableRowCollector()
        parser.feed("<table" + chunk)
        if parser.rows and any(re.search(r'(?i)paid tier', c) for c in parser.rows[0]):
            rows = parser.rows
            break
    if not rows:
        raise ValueError(f"{model_id} Standard 요금 표 없음")
    labels = {
        "input_cost": r'(?i)^input price',
        "output_cost": r'(?i)^output price',
        "cache_read_cost": r'(?i)^context caching price',
    }
    fields: dict = {}
    for key, pattern in labels.items():
        row = next((r for r in rows[1:] if len(r) >= 2 and re.search(pattern, r[0])), None)
        if row is None:
            raise ValueError(f"{model_id} 요금 표에 {key} 행 없음")
        fields[key] = _gemini_fee(row[-1], as_of)
    return fields


def gemini_parse(detail_html: str, model_id: str) -> dict:
    codes = _CodeCollector()
    codes.feed(detail_html)
    if model_id not in {c.strip() for c in codes.codes}:
        return {}
    parser = ContentTextExtractor()
    parser.feed(detail_html)
    text = parser.get_text()
    fields: dict = {"id": model_id}
    name = _str(r'<h1\b[^>]*>(.*?)</h1>', detail_html, flags=re.S)
    if name:
        fields["name"] = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', name)).strip() or None
    ctx = _num(r'Input token limit\s*:?\s*([\d,]+)', text)
    fields["context_window"] = f"{int(ctx):,}" if ctx is not None else None
    max_out = _num(r'Output token limit\s*:?\s*([\d,]+)', text)
    fields["max_output"] = f"{int(max_out):,}" if max_out is not None else None

    thinking = get(GEMINI_THINKING_URL)
    if not thinking:
        raise ValueError("Gemini thinking 문서 조회 실패")
    parsed_thinking = gemini_parse_thinking(text_of(thinking[1]), model_id)
    if parsed_thinking:
        fields.update(parsed_thinking)
        fields["effort_source"] = [GEMINI_THINKING_SOURCE]

    pricing = get(GEMINI_PRICING_URL)
    if not pricing:
        raise ValueError("Gemini pricing 문서 조회 실패")
    fields.update(gemini_parse_pricing(text_of(pricing[1]), model_id))
    fields["price_source"] = [GEMINI_PRICING_SOURCE]
    return fields


# --------------------------------------------------------------------------
# Muse (Meta)
# --------------------------------------------------------------------------

MUSE_ID_RE = re.compile(r'^muse-spark-[\d.]+(-contributor)?$')


def muse_discover() -> dict[str, str] | None:
    r = get("https://dev.meta.ai/docs/models.md")
    if not r:
        return None
    text = text_of(r[1])
    out: dict[str, str] = {}
    for m in re.finditer(r'`(muse-spark-[\d.]+(?:-contributor)?)`', text):
        model_id = m.group(1)
        if MUSE_ID_RE.match(model_id):
            out[model_id] = "https://dev.meta.ai/docs/models.md"
    return out or None


MUSE_PRICING_URL = "https://dev.meta.ai/docs/pricing-rate-limits.md"
MUSE_REASONING_URL = "https://dev.meta.ai/docs/reasoning.md"


def _muse_cells(line: str) -> list[str]:
    """markdown 표 한 줄을 셀 리스트로. 각 셀의 backtick/따옴표 래퍼를 벗긴다."""
    return [c.strip().strip('`').strip('"').strip("'").strip()
            for c in line.strip().strip('|').split('|')]


def _muse_row_for_model(text: str, model_id: str) -> list[str] | None:
    """첫 셀이 model_id와 정확히 일치하는 표 행의 셀 리스트. 없으면 None."""
    for line in text.splitlines():
        cells = _muse_cells(line)
        if len(cells) > 1 and cells[0] == model_id:
            return cells
    return None


def _muse_code_tokens(text: str) -> set[str]:
    return set(re.findall(r'`([^`]+)`', text))


def muse_parse_reasoning(text: str, model_id: str) -> list[str]:
    """https://dev.meta.ai/docs/reasoning.md 의 Value|Behavior 표를 파싱한다.
    값은 backtick/따옴표로 감싸져 있고, 'max'는 행 안에 model_id 코드 토큰이 있을 때만 허용된다.
    표를 찾지 못하면 ValueError."""
    rows = {cells[0].lower(): cells[1] for cells in map(_muse_cells, text.splitlines())
            if len(cells) >= 2}
    order = ("none", "minimal", "low", "medium", "high", "xhigh", "max")
    if not any(k in rows for k in order):
        raise ValueError("muse reasoning 표를 찾지 못했습니다")
    levels: list[str] = []
    for level in order:
        behavior = rows.get(level)
        if behavior is None or re.search(r'(?i)not\s*supported', behavior):
            continue
        if level == "max" and model_id not in _muse_code_tokens(behavior):
            continue
        levels.append(level)
    return levels


def muse_parse(text: str, model_id: str) -> dict:
    cells = _muse_row_for_model(text, model_id)
    if not cells:
        return {}
    fields: dict = {"id": model_id}
    if len(cells) >= 3:
        fields["input_modalities"] = cells[2]
    if len(cells) >= 5:
        ctx = _num(r'([\d,]+)\s*tokens', cells[4])
        if ctx is not None:
            fields["context_window"] = f"{int(ctx):,}"

    pricing = get(MUSE_PRICING_URL)
    if not pricing:
        raise ValueError("muse pricing 문서를 가져오지 못했습니다")
    ptext = text_of(pricing[1])
    tier = "Contributor" if model_id.endswith("-contributor") else "Standard"
    m = re.search(rf'###\s*{tier} tier(.*?)(?=\n###|\Z)', ptext, re.S)
    if not m:
        raise ValueError(f"muse pricing {tier} tier 섹션을 찾지 못했습니다")
    section = m.group(1)
    models_line = _str(r'(?im)^\s*\**Models:?\**:?\s*(.+)$', section)
    if models_line and model_id in _muse_code_tokens(models_line):
        prices = {cells[0].lower(): cells[1] for cells in map(_muse_cells, section.splitlines())
                  if len(cells) >= 2}
        for label, key in (("cached input", "cache_read_cost"),
                           ("input", "input_cost"),
                           ("output", "output_cost")):
            if label in prices:
                val = _num(r'\$([\d.]+)', prices[label])
                if val is not None:
                    fields[key] = val

    reasoning = get(MUSE_REASONING_URL)
    if not reasoning:
        raise ValueError("muse reasoning 문서를 가져오지 못했습니다")
    fields["effort_levels"] = muse_parse_reasoning(text_of(reasoning[1]), model_id)
    fields["effort_source"] = [{"name": "Muse reasoning 공식 문서", "url": MUSE_REASONING_URL}]
    fields["price_source"] = [{"name": "Muse 가격 공식 문서", "url": MUSE_PRICING_URL}]
    return fields


# --------------------------------------------------------------------------
# DeepSeek
# --------------------------------------------------------------------------

class _TableRowCollector(HTMLParser):
    """<tr> 텍스트를 셀 리스트로 수집한다 (rowspan/colspan 값은 그대로 반복 셀로 남을 수 있음)."""

    def __init__(self):
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = []

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None:
            self._row.append("".join(self._cell).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None

    def handle_data(self, data):
        if self._cell is not None:
            self._cell.append(data)


DEEPSEEK_PRICING_URL = "https://api-docs.deepseek.com/quick_start/pricing/"
DEEPSEEK_THINKING_URL = "https://api-docs.deepseek.com/guides/thinking_mode"


def _deepseek_model_rows(text: str) -> list[list[str]] | None:
    """MODEL 헤더 행으로 시작하는 첫 테이블만 사용한다 (footnote 숫자는 제거)."""
    parser = _TableRowCollector()
    parser.feed(text)
    for idx, row in enumerate(parser.rows):
        first = re.sub(r'\(\d+\)$', '', row[0].strip()) if row else ''
        if first.upper() == 'MODEL':
            return parser.rows[idx:]
    return None


def deepseek_discover() -> dict[str, str] | None:
    r = get(DEEPSEEK_PRICING_URL)
    if not r:
        return None
    rows = _deepseek_model_rows(text_of(r[1]))
    if not rows:
        return None
    header = rows[0]
    out: dict[str, str] = {}
    for col in range(1, len(header)):
        model_id = re.sub(r'\(\d+\)$', '', header[col].strip()).lower()
        if re.match(r'^deepseek-(flash|v\d[\w.-]*)$', model_id):
            out[model_id] = DEEPSEEK_PRICING_URL
    return out or None


def deepseek_parse(text: str, model_id: str) -> dict:
    rows = _deepseek_model_rows(text)
    fields: dict = {}
    if not rows:
        return fields
    header = rows[0]
    model_ids = [re.sub(r'\(\d+\)$', '', c.strip()).lower() for c in header[1:]]
    if model_id not in model_ids:
        return fields
    fields["id"] = model_id  # MODEL 헤더 행에서 요청 ID를 정확히 확인한 경우에만
    pos = model_ids.index(model_id)  # 0-based among models
    num_models = len(model_ids)

    def model_cell(row: list[str]) -> str | None:
        """행 끝의 num_models개 셀이 모델별 값이라고 가정한다.
        colspan으로 값이 한 칸(공유값)만 남은 경우 모든 모델에 동일 적용한다."""
        if len(row) >= num_models + 1:
            return row[len(row) - num_models + pos]
        if len(row) == 2:
            return row[1]
        return None

    section = None  # 1M INPUT TOKENS(CACHE HIT/MISS) / 1M OUTPUT TOKENS
    peak_cost_field = {
        "1M INPUT TOKENS(CACHE HIT)": "cache_read_cost",
        "1M INPUT TOKENS(CACHE MISS)": "input_cost",
        "1M OUTPUT TOKENS": "output_cost",
    }
    for row in rows[1:]:
        joined_labels = [re.sub(r'\(\d+\)$', '', c.strip()) for c in row]
        first = joined_labels[0].upper()
        for label in joined_labels:
            if label.upper() in peak_cost_field:
                section = label.upper()
        if first == 'MODEL VERSION':
            value = model_cell(row)
            if value:
                fields["name"] = value
        elif first == 'CONTEXT LENGTH':
            value = model_cell(row)
            if value:
                fields["context_window"] = value
        elif first == 'MAX OUTPUT':
            value = model_cell(row)
            if value:
                fields["max_output"] = re.sub(r'(?i)^maximum:\s*', '', value)
        elif first == 'PEAK' and section in peak_cost_field:
            value = model_cell(row)
            price = _num(r'([\d.]+)', value) if value else None
            if price is not None:
                fields[peak_cost_field[section]] = price

    thinking = get(DEEPSEEK_THINKING_URL)
    if not thinking:
        raise ValueError("DeepSeek thinking_mode 문서 조회 실패")
    extractor = ContentTextExtractor()
    extractor.feed(text_of(thinking[1]))
    levels = deepseek_parse_thinking(extractor.get_text(), model_id)
    if levels is not None:
        fields["effort_levels"] = levels
        fields["effort_source"] = [{"name": "DeepSeek Thinking Mode 문서", "url": DEEPSEEK_THINKING_URL}]
    return fields


def deepseek_parse_thinking(text: str, model_id: str) -> list[str] | None:
    """HTML을 벗긴 thinking_mode 문서에서 reasoning_effort 뒤에 오는 값
    ("low" / "high" / "max" 슬래시 구분 또는 단일 값)을 모은다. 없으면 None."""
    found: set[str] = set()
    for tail in re.findall(r'reasoning_effort["\']?\s*:?\s*([^\n,}]*)', text):
        found.update(re.findall(r'\b(low|high|max)\b', tail.lower()))
    return [lv for lv in ("low", "high", "max") if lv in found] or None


# --------------------------------------------------------------------------
# 병합 로직
# --------------------------------------------------------------------------

def family_key(model_id: str) -> str:
    """ponytail: 버전 숫자 토큰만 제거하는 휴리스틱. deepseek v4→v5처럼 토큰에 숫자가
    붙어있으면 새 family로 오판될 수 있음 — family map을 명시적으로 관리하게 되면 교체."""
    tokens = re.split(r'[-.]', model_id)
    kept = [t for t in tokens if not re.match(r'^\d+$', t)]
    return "-".join(kept) or model_id


def insert_new_model(models: list[dict], new_model: dict) -> None:
    """같은 family가 있으면 그 첫 멤버 앞에, 처음 보는 family면 맨 앞에(상위 6개 안에 보이도록)."""
    key = family_key(new_model["id"])
    for idx, existing in enumerate(models):
        if family_key(existing["id"]) == key:
            models.insert(idx, new_model)
            return
    models.insert(0, new_model)


def _useful(parsed: dict) -> dict:
    specs = {"input_cost", "output_cost", "cache_read_cost", "context_window", "max_output", "input_modalities", "effort_levels"}
    return {k: v for k, v in parsed.items() if k in specs and v not in (None, "", UNCONFIRMED, [])}


def apply_known_fields(model: dict, parsed: dict) -> None:
    """None/빈 값은 무시하고 명시적으로 파싱된 값만 덮어쓴다(공식 무료 요금 0은 유효). 한국어로 검수된 텍스트나
    표기만 다른 동일 값(128K vs 128,000)은 유지한다. effort_source/price_source는 URL 중복 없이 합친다."""
    for key in ("input_cost", "output_cost", "cache_read_cost", "released_at"):
        value = parsed.get(key)
        if value not in (None, "", UNCONFIRMED):
            model[key] = value
    for key in ("name", "context_window", "max_output", "input_modalities", "key_feature"):
        value = parsed.get(key)
        if value in (None, "", UNCONFIRMED) or _keep_existing_text(model.get(key), value):
            continue
        model[key] = value
    if "effort_levels" in parsed:
        model["effort_levels"] = parsed["effort_levels"]
    if parsed.get("effort_source"):
        model["effort_source"] = _merge_sources(model.get("effort_source"), parsed["effort_source"])
    if parsed.get("price_source"):
        model["sources"] = _merge_sources(model.get("sources"), parsed["price_source"])


def new_model_stub(model_id: str, parsed: dict, sources: list[dict]) -> dict:
    stub = {
        "id": model_id,
        "name": parsed.get("name") or model_id,
        # 그룹 기본 effort_note를 물려받지 않도록 미확인 문구를 명시한다.
        "effort_note": "지원 수준과 사용 조건은 공식 문서를 확인하세요." if "effort_levels" in parsed else "공식 지원 수준 확인 필요",
        "release_source": sources[0]["url"] if sources else None,
        "minimum_access": "앱 요금제 미확인 · API 이용 조건은 공식 문서 확인",
        "access_source": sources[0]["url"] if sources else None,
        "input_cost": parsed.get("input_cost"),
        "output_cost": parsed.get("output_cost"),
        "cache_read_cost": parsed.get("cache_read_cost"),
        "context_window": parsed.get("context_window") or UNCONFIRMED,
        "max_output": parsed.get("max_output") or UNCONFIRMED,
        "input_modalities": parsed.get("input_modalities") or UNCONFIRMED,
        "key_feature": parsed.get("key_feature") or UNCONFIRMED,
        "sources": _merge_sources(sources, parsed.get("price_source") or []),
        "price_note": UNCONFIRMED,
    }
    if "effort_levels" in parsed:
        stub["effort_levels"] = parsed["effort_levels"]
    if parsed.get("effort_source"):
        stub["effort_source"] = list(parsed["effort_source"])
    if parsed.get("released_at"):
        stub["released_at"] = parsed["released_at"]
    return stub


def _fetch_parse(parse_fn, detail_url: str, model_id: str) -> tuple[dict | None, str | None]:
    """(parsed, error). 조회 실패/예외/빈 파싱/ID 불일치/사양 없음은 모두 error다 — 묵시적 성공 없음."""
    r = get(detail_url)
    if not r:
        return None, "조회 실패"
    try:
        parsed = parse_fn(text_of(r[1]), model_id)
    except Exception as exc:
        return None, f"파싱 예외: {exc}"
    if not parsed:
        return None, "문서에서 모델을 찾지 못함"
    if parsed.get("id") != model_id:
        return None, f"ID 불일치({parsed.get('id')})"
    if not _useful(parsed):
        return None, "확인된 사양 없음"
    for key in ("input_cost", "output_cost", "cache_read_cost"):
        value = parsed.get(key)
        if value is not None and (not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0):
            return None, f"유효하지 않은 요금: {key}"
    if "effort_levels" in parsed and not parsed.get("effort_source"):
        parsed["effort_source"] = [{"name": f"{model_id} 공식 문서", "url": detail_url}]
    return parsed, None


def run_provider(slug: str, group: dict, auto_update_providers: dict, discover_fn, parse_fn) -> dict:
    """반환: {"status": success|partial|failure, "discovered_ids": [...], "error": str|None}.
    detail 조회/파싱 실패는 기존 데이터를 보존한 채 partial로 보고하고,
    해당 모델은 baseline에 넣지 않아 다음 실행에서 재시도된다."""
    catalog = discover_fn()
    if not catalog:
        return {"status": "failure", "discovered_ids": [], "error": "목록 조회 실패 또는 빈 카탈로그"}

    prior = auto_update_providers.get(slug, {})
    baseline = set(prior.get("discovered_ids", []))
    existing_ids = {m["id"] for m in group["models"]}
    first_run = "discovered_ids" not in prior

    failures: list[str] = []
    new_baseline = set(baseline)

    for model_id in sorted(existing_ids - set(catalog)):
        failures.append(f"{model_id}: 카탈로그에 없음(기존 값 유지)")

    for model_id, detail_url in catalog.items():
        if model_id in existing_ids:
            parsed, err = _fetch_parse(parse_fn, detail_url, model_id)
            if err:
                failures.append(f"{model_id}: {err}")
                continue
            for m in group["models"]:
                if m["id"] == model_id:
                    apply_known_fields(m, parsed)
            if any(parsed.get(k) is None for k in ("input_cost", "output_cost", "cache_read_cost")):
                failures.append(f"{model_id}: 요금 일부 미확인(확인되지 않은 값은 유지)")
            continue

        if first_run or model_id in baseline:
            continue

        parsed, err = _fetch_parse(parse_fn, detail_url, model_id)
        if err:
            failures.append(f"{model_id}: {err}")
            continue
        sources = [{"name": f"{model_id} 공식 문서", "url": detail_url}]
        insert_new_model(group["models"], new_model_stub(model_id, parsed, sources))
        new_baseline.add(model_id)
        if any(parsed.get(k) is None for k in ("input_cost", "output_cost", "cache_read_cost")):
            failures.append(f"{model_id}: 새 모델 추가, 요금 일부 미확인")

    discovered_ids = sorted((set(catalog) if first_run else new_baseline) | existing_ids)
    if failures:
        return {"status": "partial", "discovered_ids": discovered_ids, "error": "; ".join(failures)}
    return {"status": "success", "discovered_ids": discovered_ids, "error": None}


def provider_state(prior: dict, result: dict, checked_at: str) -> dict:
    """failure 시 이전 discovered_ids가 있을 때만 이어받는다(첫 실패에 [] 마커를 만들지 않음)."""
    state = {"checked_at": checked_at, "status": result["status"]}
    if result["status"] != "failure":
        state["discovered_ids"] = result["discovered_ids"]
    elif "discovered_ids" in prior:
        state["discovered_ids"] = prior["discovered_ids"]
    if result.get("error"):
        state["error"] = result["error"]
    return state


PROVIDERS = {
    "claude": (claude_discover, claude_parse),
    "codex": (codex_discover, codex_parse),
    "grok": (grok_discover, grok_parse),
    "gemini": (gemini_discover, gemini_parse),
    "muse": (muse_discover, muse_parse),
    "deepseek": (deepseek_discover, deepseek_parse),
}


def main() -> int:
    data = read_json(DATA_PATH)
    groups = {g["agent_slug"]: g for g in data.get("agents", [])}
    auto_update = data.setdefault("auto_update", {"providers": {}})
    providers_state = auto_update.setdefault("providers", {})

    checked_at = now_kst_str()
    statuses: list[str] = []
    for slug, (discover_fn, parse_fn) in PROVIDERS.items():
        group = groups.get(slug)
        if group is None:
            # 예상 그룹이 데이터에 없으면 해당 제공사 조회 자체가 불가능한 failure다.
            result = {"status": "failure", "discovered_ids": [], "error": f"'{slug}' 그룹을 찾을 수 없음"}
        else:
            try:
                result = run_provider(slug, group, providers_state, discover_fn, parse_fn)
            except Exception as exc:  # 파서 예외는 해당 제공사만 failure 처리, 기존 데이터 보존
                result = {"status": "failure", "discovered_ids": [], "error": str(exc)}

        statuses.append(result["status"])
        providers_state[slug] = provider_state(providers_state.get(slug, {}), result, checked_at)
        count = len(group["models"]) if group else 0
        print(f"[{slug}] {result['status']} models={count}"
              + (f" error={result['error']}" if result.get("error") else ""))

    auto_update["last_checked_at"] = checked_at
    if all(s == "success" for s in statuses):
        auto_update["last_successful_check_at"] = checked_at
        auto_update["status"] = "success"
        data["checked_at"] = today_kst()
        data["unit_note"] = re.sub(
            r'^\d{4}-\d{2}-\d{2} (?:확인|공식 모델 목록 자동 조회)',
            f"{today_kst()} 공식 모델 목록 자동 조회",
            data.get("unit_note", ""),
        )
    elif all(s == "failure" for s in statuses):
        auto_update["status"] = "failure"
    else:
        auto_update["status"] = "partial"

    write_json(DATA_PATH, data)
    print(f"[total] {auto_update['status']} checked_at={checked_at}")
    return 0 if auto_update["status"] == "success" else 1


# --------------------------------------------------------------------------
# self-check (프레임워크 없이 assert만 사용)
# --------------------------------------------------------------------------

_CLAUDE_EFFORT_MD = b"""---
title: Effort
featureMetadata:
  supportedModels:
    - claude-fable-5-1
    - claude-opus-5-5
    - claude-opus-5
---
| Level | Description |
| `low` | Fastest. |
| `medium` | Balanced. |
| `high` | Default. |
| `xhigh` | Available on [Claude Opus 5.5](/docs/opus) and Claude Fable 5.1. |
| `max` | Available on Claude Opus 5.5 and Claude Fable 5.1. |
"""

_MUSE_MODELS_MD = b"""| Model ID | Name | Input | Output | Context |
| `muse-spark-1.3` | Muse Spark 1.3 | Text, image, video, PDF | Text | 1,048,576 tokens |
| `muse-spark-1.3-contributor` | Muse Spark 1.3 | Text, image | Text | 1,048,576 tokens |
"""

_MUSE_PRICING_MD = b"""### Standard tier
**Models:** `muse-spark-1.3`, `muse-spark-1.2`
| Type | Price per 1M |
| Input | $1.25 |
| Cached input | $0.15 |
| Output | $4.25 |
### Contributor tier
**Models:** `muse-spark-1.3-contributor`
| Input | $0.10 |
| Cached input | $0.002 |
| Output | $0.20 |
"""

_MUSE_REASONING_MD = b"""| Value | Behavior |
| `none` | Not supported. |
| `minimal` | Minimal. |
| `low` | Low. |
| `medium` | Medium. |
| `high` | High. |
| `xhigh` | Extra high. |
| `max` | Only on `muse-spark-1.3`. |
"""

_DEEPSEEK_THINKING_HTML = (
    b'<html><body><p>Set reasoning_effort in the request.</p>'
    b'<pre>{"model": "deepseek-v4-pro", "reasoning_effort": "low" / "high" / "max", "messages": []}</pre>'
    b'</body></html>'
)


def _self_check() -> None:
    """네트워크 없이 파서/병합/상태 로직을 검증한다. get()은 URL별 고정 응답으로 바꾸고 finally에서 복구."""
    global get
    real_get = get
    fixtures = {
        CLAUDE_EFFORT_URL: _CLAUDE_EFFORT_MD,
        MUSE_PRICING_URL: _MUSE_PRICING_MD,
        MUSE_REASONING_URL: _MUSE_REASONING_MD,
        DEEPSEEK_THINKING_URL: _DEEPSEEK_THINKING_HTML,
    }
    get = lambda url: (200, fixtures.get(url, b"stub"))  # noqa: E731
    try:
        _self_check_body(fixtures)
    finally:
        get = real_get
    print("self-check OK")


def _self_check_body(fixtures: dict) -> None:
    global get

    # --- Claude: Markdown 링크 라벨, 단위 정규화, effort 표(이름 전체 일치) ---
    claude_opus = (
        "---\ntitle: Claude Opus 5.5\n---\n"
        "**Latest.** Released September 22, 2026.\n"
        "Model ID: `claude-opus-5-5`\n"
        "| [Input](/p) | $4 / MTok |\n"
        "| [Output](/p) | $20 / MTok |\n"
        "| [Cache read](/p) | $0.20 / MTok |\n"
        "| [Context window](/c) | 1M tokens |\n"
        "| [Max output](/c) | 128,000 tokens |\n"
        "| Default effort | `medium` |\n"
    )
    parsed = claude_parse(claude_opus, "claude-opus-5-5")
    assert parsed["id"] == "claude-opus-5-5"
    assert parsed["released_at"] == "2026-09-22"
    assert (parsed["input_cost"], parsed["output_cost"], parsed["cache_read_cost"]) == (4.0, 20.0, 0.2)
    assert parsed["context_window"] == "1M" and parsed["max_output"] == "128K", parsed
    assert parsed["effort_levels"] == ["low", "medium", "high", "xhigh", "max"], parsed
    assert parsed["effort_source"] == [CLAUDE_EFFORT_SOURCE]
    # Opus 5는 'Claude Opus 5.5' 접두어로 오인되지 않아 xhigh/max가 없다.
    parsed = claude_parse(claude_opus.replace("Opus 5.5", "Opus 5").replace("opus-5-5", "opus-5"), "claude-opus-5")
    assert parsed["effort_levels"] == ["low", "medium", "high"], parsed
    assert "xhigh" in claude_effort_levels("| xhigh | Available on Claude Sonnet 5. |", "Claude Sonnet 5")
    assert "xhigh" not in claude_effort_levels("| xhigh | Available on Claude Sonnet 5.5. |", "Claude Sonnet 5")
    assert not _useful({"id": "only-a-name", "name": "Only a name"})
    # Haiku: pinned ID + alias 문장이 있을 때만 요청 ID 인정, Not supported → []
    haiku = (
        "---\ntitle: Claude Haiku 4.5\n---\n"
        "Model ID: `claude-haiku-4-5-20251001`\n"
        "You can also use `claude-haiku-4-5`, a convenience alias for the pinned ID.\n"
        "| Default effort | Not supported |\n"
    )
    parsed = claude_parse(haiku, "claude-haiku-4-5")
    assert parsed["id"] == "claude-haiku-4-5" and parsed["effort_levels"] == [], parsed
    parsed = claude_parse(haiku.replace("convenience alias", "older name"), "claude-haiku-4-5")
    assert parsed["id"] == "claude-haiku-4-5-20251001"
    # 지원 목록에 없고 Not supported도 아니면 effort_levels 생략
    parsed = claude_parse(claude_opus.replace("opus-5-5", "opus-4"), "claude-opus-4")
    assert "effort_levels" not in parsed
    # effort 문서 조회 실패는 묵시적 성공이 아니라 오류
    fixtures[CLAUDE_EFFORT_URL] = None
    try:
        get_backup = get
        get = lambda url: (200, fixtures[url]) if fixtures.get(url) else None  # noqa: E731
        try:
            claude_parse(claude_opus, "claude-opus-5-5")
            raise AssertionError("effort 문서 없음인데 성공")
        except ValueError:
            pass
    finally:
        get = get_backup
        fixtures[CLAUDE_EFFORT_URL] = _CLAUDE_EFFORT_MD

    # --- Codex: backtick 문장, none 포함, 문서 색인 blockquote 건너뛰기 ---
    openai_sample = (
        "# GPT-6 Luna\n"
        "> Documentation index: see /api/docs\n"
        "> Efficient model for focused, high-volume tasks.\n"
        "Model ID: `gpt-6-luna`\n"
        "- 1,050,000 context window\n"
        "- 128,000 max output tokens\n"
        "- Input modalities: text, image\n"
        "| Input | $0.1 |\n"
        "| Cached input | $0.01 |\n"
        "| Output | $0.5 |\n"
        "`reasoning.effort` supports `none`, `low`, `medium` (default), `high`, `xhigh`, and `max`. "
        "`minimal` is not supported.\n"
    )
    parsed2 = codex_parse(openai_sample, "gpt-6-luna")
    assert parsed2["id"] == "gpt-6-luna"
    assert parsed2["key_feature"].startswith("Efficient"), parsed2["key_feature"]
    assert parsed2["context_window"] == "1,050,000" and parsed2["input_cost"] == 0.1
    assert parsed2["effort_levels"] == ["none", "low", "medium", "high", "xhigh", "max"], parsed2
    sol = codex_parse(openai_sample.replace("`none`, `low`", "`low`").replace(
        "`minimal` is not supported", "`none` and `minimal` are not supported"), "gpt-6.1-sol")
    assert sol["effort_levels"] == ["low", "medium", "high", "xhigh", "max"], sol

    # irrelevant date (knowledge cutoff 등)는 released_at으로 오인하지 않는다.
    assert parse_release_date("Training data cutoff: 2026-01-15") is None
    assert parse_release_date("Released March 3, 2026.") == "2026-03-03"

    # --- Gemini: 날짜 구간 요금 헬퍼 (2026 vs 2027) ---
    cell = "$0.75 through December 31, 2026. $1.50 starting January 1, 2027. $4.50 per hour storage."
    assert _gemini_fee(cell, date(2026, 9, 30)) == 0.75
    assert _gemini_fee(cell, date(2027, 1, 1)) == 1.5

    # --- Muse: 실제 표 형식에서 Input vs Cached input 구분, max는 Standard 1.3만 ---
    muse_text = _MUSE_MODELS_MD.decode()
    muse = muse_parse(muse_text, "muse-spark-1.3")
    assert muse["id"] == "muse-spark-1.3" and muse["context_window"] == "1,048,576", muse
    assert (muse["input_cost"], muse["cache_read_cost"], muse["output_cost"]) == (1.25, 0.15, 4.25), muse
    assert muse["effort_levels"] == ["minimal", "low", "medium", "high", "xhigh", "max"], muse
    contrib = muse_parse(muse_text, "muse-spark-1.3-contributor")
    assert (contrib["input_cost"], contrib["cache_read_cost"]) == (0.10, 0.002), contrib
    assert contrib["effort_levels"] == ["minimal", "low", "medium", "high", "xhigh"], contrib
    assert muse_parse(muse_text, "muse-spark-9.9") == {}

    # --- DeepSeek: 첫 MODEL 표의 peak 요금, ID 확인, thinking 문서의 슬래시 구분 effort ---
    deepseek_rows = [
        ["MODEL", "deepseek-flash(1)", "deepseek-v4-pro"],
        ["MODEL VERSION", "DeepSeek-V4.1-Flash", "DeepSeek-V4-Pro-0813"],
        ["CONTEXT LENGTH", "1M"],
        ["MAX OUTPUT", "MAXIMUM: 384K"],
        ["PRICING(2)", "1M INPUT TOKENS(CACHE HIT)", "OFF-PEAK", "$0.003", "$0.022"],
        ["PEAK", "$0.006", "$0.044"],
        ["1M INPUT TOKENS(CACHE MISS)", "OFF-PEAK", "$0.15", "$0.66"],
        ["PEAK", "$0.3", "$1.32"],
        ["1M OUTPUT TOKENS", "OFF-PEAK", "$0.6", "$1.98"],
        ["PEAK", "$1.2", "$3.96"],
    ]
    deepseek_html = "<table>" + "".join(
        "<tr>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>" for row in deepseek_rows
    ) + "</table>"
    flash = deepseek_parse(deepseek_html, "deepseek-flash")
    assert flash["id"] == "deepseek-flash" and flash["name"] == "DeepSeek-V4.1-Flash"
    assert flash["context_window"] == "1M" and flash["max_output"] == "384K"
    assert (flash["cache_read_cost"], flash["input_cost"], flash["output_cost"]) == (0.006, 0.3, 1.2)
    assert flash["effort_levels"] == ["low", "high", "max"], flash
    pro = deepseek_parse(deepseek_html, "deepseek-v4-pro")
    assert (pro["cache_read_cost"], pro["input_cost"], pro["output_cost"]) == (0.044, 1.32, 3.96)
    assert deepseek_parse(deepseek_html, "deepseek-v9") == {}  # 미확인 ID에는 id를 붙이지 않음
    assert _deepseek_model_rows(deepseek_html)[0] == deepseek_rows[0]

    # --- 병합: 한국어/동일 표기 보존, 공식 무료 요금 0 반영, 미확인 무시, 출처 URL 중복 제거 ---
    model = {"name": "DeepSeek V4 Pro 0813", "max_output": "128K", "key_feature": "에이전트",
             "input_cost": 1.32, "effort_source": [{"name": "x", "url": "https://p/effort"}]}
    apply_known_fields(model, {"name": "DeepSeek-V4-Pro-0813", "max_output": "128,000",
                               "key_feature": "Agentic", "input_cost": 0, "cache_read_cost": UNCONFIRMED,
                               "effort_source": [{"name": "y", "url": "https://p/effort.md"}]})
    assert model["name"] == "DeepSeek V4 Pro 0813" and model["max_output"] == "128K"
    assert model["key_feature"] == "에이전트" and model["input_cost"] == 0 and "cache_read_cost" not in model
    assert len(model["effort_source"]) == 1, model["effort_source"]
    apply_known_fields(model, {"name": "DeepSeek-V4-Pro-0920", "input_cost": 1.5})
    assert model["name"] == "DeepSeek-V4-Pro-0920" and model["input_cost"] == 1.5

    # 새 모델 stub: 그룹 기본 effort_note 대신 미확인 문구, effort 미파싱이면 필드 생략
    stub = new_model_stub("grok-9", {"context_window": "1M"}, [{"name": "s", "url": "u"}])
    assert stub["effort_note"] == "공식 지원 수준 확인 필요" and "effort_levels" not in stub

    # family ordering: 같은 family 앞, 처음 보는 family는 맨 앞
    models = [{"id": "claude-opus-5-5"}, {"id": "claude-sonnet-5"}, {"id": "claude-haiku-4-5"}]
    insert_new_model(models, {"id": "claude-sonnet-5-5"})
    insert_new_model(models, {"id": "claude-nova-1"})
    ids = [m["id"] for m in models]
    assert ids == ["claude-nova-1", "claude-opus-5-5", "claude-sonnet-5-5", "claude-sonnet-5", "claude-haiku-4-5"], ids

    ok_parse = lambda text, model_id: {"id": model_id, "context_window": "1M", "input_cost": 0, "output_cost": 0, "cache_read_cost": 0}  # noqa: E731

    # discover 실패: failure, 데이터 보존, 첫 실패에는 discovered_ids 마커를 남기지 않는다.
    group = {"models": [{"id": "grok-4.7"}]}
    result = run_provider("grok", group, {}, lambda: None, ok_parse)
    assert result["status"] == "failure" and group["models"] == [{"id": "grok-4.7"}]
    assert "discovered_ids" not in provider_state({}, result, "t")
    assert provider_state({"discovered_ids": ["grok-4.7"]}, result, "t")["discovered_ids"] == ["grok-4.7"]

    # 첫 실행(bootstrap): 카탈로그를 discovered_ids로 남기되 새 모델은 추가하지 않는다.
    group2 = {"models": [{"id": "grok-4.7"}]}
    result2 = run_provider("grok", group2, {}, lambda: {"grok-4.7": "u", "grok-4.8": "u2"}, ok_parse)
    assert result2["status"] == "success" and [m["id"] for m in group2["models"]] == ["grok-4.7"]
    assert set(result2["discovered_ids"]) == {"grok-4.7", "grok-4.8"}

    # 기존 모델의 빈 파싱/ID 불일치/카탈로그 누락은 partial, 기존 값 유지
    group2b = {"models": [{"id": "grok-4.7", "context_window": "500K"}]}
    r = run_provider("grok", group2b, {}, lambda: {"grok-4.7": "u"}, lambda t, m: {})
    assert r["status"] == "partial" and group2b["models"][0]["context_window"] == "500K"
    r = run_provider("grok", group2b, {}, lambda: {"grok-4.8": "u"}, ok_parse)
    assert r["status"] == "partial" and "grok-4.7" in r["error"] and "grok-4.7" in r["discovered_ids"]

    # 실제 추가 + idempotency(중복 없음)
    group3 = {"models": [{"id": "grok-4.7"}]}
    result3 = run_provider("grok", group3, {"grok": {"discovered_ids": ["grok-4.7"]}},
                           lambda: {"grok-4.7": "u", "grok-4.9": "u3"}, ok_parse)
    assert result3["status"] == "success" and [m["id"] for m in group3["models"]] == ["grok-4.9", "grok-4.7"]
    run_provider("grok", group3, {"grok": {"discovered_ids": result3["discovered_ids"]}},
                 lambda: {"grok-4.7": "u", "grok-4.9": "u3"}, ok_parse)
    assert [m["id"] for m in group3["models"]].count("grok-4.9") == 1

    # 신규 후보의 id 불일치 → partial, 추가하지 않고 baseline에도 넣지 않는다(재시도 가능)
    group4 = {"models": [{"id": "grok-4.7"}]}
    result4 = run_provider("grok", group4, {"grok": {"discovered_ids": ["grok-4.7"]}},
                           lambda: {"grok-4.10": "u4"},
                           lambda text, model_id: {"id": "grok-9.9", "context_window": "1M"})
    assert result4["status"] == "partial" and group4["models"] == [{"id": "grok-4.7"}]
    assert "grok-4.10" not in result4["discovered_ids"]

    # detail 조회 실패 → partial, 기존 보존, baseline 미포함 → 다음 실행에서 추가된다
    offline_stub = get
    get = lambda url: None  # noqa: E731
    try:
        group5 = {"models": []}
        result5 = run_provider("grok", group5, {"grok": {"discovered_ids": []}}, lambda: {"grok-5.0": "u"}, ok_parse)
        assert result5["status"] == "partial" and group5["models"] == []
        assert "grok-5.0" not in result5["discovered_ids"]
    finally:
        get = offline_stub
    result5b = run_provider("grok", group5, {"grok": {"discovered_ids": result5["discovered_ids"]}},
                            lambda: {"grok-5.0": "u"}, ok_parse)
    assert result5b["status"] == "success" and [m["id"] for m in group5["models"]] == ["grok-5.0"]

    # unit_note 접두어: 이전 '확인' 표기와 새 표기 모두 오늘 날짜의 새 표기로 바뀐다
    pat = r'^\d{4}-\d{2}-\d{2} (?:확인|공식 모델 목록 자동 조회)'
    for note in ("2026-09-30 확인 · 가격", "2026-09-30 공식 모델 목록 자동 조회 · 가격"):
        assert re.sub(pat, "2026-10-01 공식 모델 목록 자동 조회", note) == "2026-10-01 공식 모델 목록 자동 조회 · 가격"
    assert re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00', now_kst_str())

    # --- Astra/Luna: Codex ultra는 codex_modes 전용 필드이며 API effort_levels 갱신에도 섞이지 않는다 ---
    real_data = read_json(DATA_PATH)
    real_models = [m for g in real_data.get("agents", []) for m in g.get("models", [])]
    astra = next(m for m in real_models if m["id"] == "gpt-6-astra")
    luna = next(m for m in real_models if m["id"] == "gpt-6-luna")
    assert astra.get("codex_modes") == ["ultra"], astra.get("codex_modes")
    assert "ultra" not in astra["effort_levels"], astra["effort_levels"]
    assert luna.get("codex_modes") is None, luna.get("codex_modes")
    assert "ultra" not in luna["effort_levels"], luna["effort_levels"]

    astra_copy = deepcopy(astra)
    apply_known_fields(astra_copy, {"effort_levels": ["low", "medium", "high", "xhigh", "max"],
                                    "effort_source": [{"name": "z", "url": "https://p/astra-effort"}]})
    assert astra_copy["codex_modes"] == ["ultra"], astra_copy["codex_modes"]
    assert "ultra" not in astra_copy["effort_levels"], astra_copy["effort_levels"]
    assert astra_copy["effort_note"] == astra["effort_note"]
    assert any("learn.chatgpt.com/docs/models" in s["url"] for s in astra_copy["effort_source"])


if __name__ == "__main__":
    if "--self-check" in sys.argv:
        _self_check()
        sys.exit(0)
    sys.exit(main())
