#!/usr/bin/env python3
"""검토된 편집 필드를 검증하고 누적 archive(data/today.json)에 원자적으로 보강하는 스크립트"""

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from collect_content import validate_url, canonicalize_url

DATA_DIR = ROOT / "data"
TODAY_PATH = DATA_DIR / "today.json"
MAX_INPUT_BYTES = 1 * 1024 * 1024  # 1MB
FORBIDDEN_KEYWORDS = [".env", "login", "auth", "credential", "secret", "password", "id_rsa"]

TOP_LEVEL_FIELDS = {"edition_date", "window_start", "window_end", "collected_at", "reviewed_at", "articles"}
EDITORIAL_FIELDS = ["title", "summary", "why_it_matters"]
# 공식 메타데이터: 입력에 있으면 archive 값과 같아야 하며 이 도구로는 바뀌지 않는다.
OFFICIAL_FIELDS = ["source_id", "source_name", "source_url", "published_at", "published_on", "date_precision"]
ARTICLE_FIELDS = {"id", "source_summary", "fetched_at", *EDITORIAL_FIELDS, *OFFICIAL_FIELDS}


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


def validate_reviewed_edition(reviewed: dict, current_today: dict) -> None:
    """검토 파일이 누적 archive(current_today)의 기존 기사에 편집 필드만 보강하는지 검증한다.

    기존 전체 edition 형식(window·collected_at 포함)도 받지만, archive가 누적 구조이므로
    그 값들은 검증·반영하지 않는다. 기사 수 상한과 1/7일 윈도우 제한은 없다.
    """
    if not isinstance(reviewed, dict) or not isinstance(current_today, dict):
        raise ValueError("판본·공개 archive 데이터는 JSON 객체여야 합니다.")
    if not set(reviewed) <= TOP_LEVEL_FIELDS:
        raise ValueError(f"판본에 허용되지 않는 필드가 있습니다: {sorted(set(reviewed) - TOP_LEVEL_FIELDS)}")

    try:
        rev_dt = datetime.fromisoformat(reviewed.get("reviewed_at"))
    except (TypeError, ValueError) as error:
        raise ValueError(f"reviewed_at ISO 시각 형식이 올바르지 않습니다: {error}")
    if rev_dt.tzinfo is None:
        raise ValueError("reviewed_at에 시간대(Timezone) 정보가 없습니다.")
    # Allow up to 5 minutes clock skew for reviewed_at
    if rev_dt > datetime.now(timezone.utc) + timedelta(minutes=5):
        raise ValueError(f"reviewed_at 시각({reviewed['reviewed_at']})은 현재 시각보다 미래일 수 없습니다.")

    articles = reviewed.get("articles")
    if not isinstance(articles, list) or not articles:
        raise ValueError("articles는 보강할 기사가 1건 이상 담긴 배열이어야 합니다.")

    archive_by_id = {a["id"]: a for a in current_today.get("articles") or [] if isinstance(a, dict) and "id" in a}
    seen_ids = set()

    for idx, art in enumerate(articles, start=1):
        if not isinstance(art, dict):
            raise ValueError(f"{idx}번째 기사 항목이 객체(dict) 형식이 아닙니다.")
        if not set(art) <= ARTICLE_FIELDS:
            raise ValueError(f"{idx}번째 기사에 허용되지 않는 필드가 있습니다: {sorted(set(art) - ARTICLE_FIELDS)}")

        for af in ["id", "source_url", *EDITORIAL_FIELDS]:
            val = art.get(af)
            if not isinstance(val, str) or not val.strip():
                raise ValueError(f"{idx}번째 기사({art.get('id', 'ID미상')})의 필수 필드 '{af}'가 문자열이 아니거나 비어 있습니다.")

        art_id = art["id"]
        if art_id in seen_ids:
            raise ValueError(f"중복된 기사 ID가 발견되었습니다: {art_id}")
        seen_ids.add(art_id)

        try:
            validate_url(art["source_url"], None)  # 호스트는 아래에서 archive의 URL과 일치해야 하므로 허용 목록 대신 형식만 검사
        except ValueError as error:
            raise ValueError(f"기사 '{art_id}'의 출처 URL 검증 실패: {error}")

        # Check Korean text presence in summary and why_it_matters
        if not re.search(r'[가-힣]', art["summary"]):
            raise ValueError(f"기사 '{art_id}'의 summary에 한국어 설명이 누락되었습니다.")
        if not re.search(r'[가-힣]', art["why_it_matters"]):
            raise ValueError(f"기사 '{art_id}'의 why_it_matters에 한국어 설명이 누락되었습니다.")

        # Match with the accumulated archive (id 일치 + 같은 정규화 URL)
        archived = archive_by_id.get(art_id)
        if not archived:
            raise ValueError(f"기사 ID '{art_id}'는 data/today.json archive에 존재하지 않습니다. 먼저 수집을 실행하세요.")
        if canonicalize_url(art["source_url"]) != canonicalize_url(archived.get("source_url") or ""):
            raise ValueError(f"기사 '{art_id}'의 source_url이 archive의 값('{archived.get('source_url')}')과 일치하지 않습니다.")

        for match_key in OFFICIAL_FIELDS:
            if match_key != "source_url" and match_key in art and art[match_key] != archived.get(match_key):
                raise ValueError(f"기사 '{art_id}'의 {match_key} 값('{art[match_key]}')이 archive의 값('{archived.get(match_key)}')과 일치하지 않습니다.")


def apply_reviewed_edition(reviewed: dict, current_today: dict) -> dict:
    """검증된 판본의 편집 필드만 archive 사본에 반영한다. 다른 기사·필드·정렬은 그대로다."""
    edits = {art["id"]: art for art in reviewed["articles"]}
    merged = dict(current_today, reviewed_at=reviewed["reviewed_at"])
    merged["articles"] = [
        {**a, **{f: edits[a["id"]][f] for f in EDITORIAL_FIELDS}} if isinstance(a, dict) and a.get("id") in edits else a
        for a in current_today.get("articles") or []
    ]
    return merged


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("사용법: python3 scripts/publish_news.py <프로젝트-내-reviewed-edition.json>")
        print("검토 결과를 검증한 후 data/today.json archive의 해당 기사에 편집 필드(title·summary·why_it_matters)만 원자적으로 보강합니다.")
        sys.exit(0 if len(sys.argv) >= 2 else 1)

    raw_arg = sys.argv[1]
    input_path = Path(raw_arg)

    if input_path.is_symlink():
        sys.exit("오류: 심볼릭 링크 파일은 허용되지 않습니다.")

    try:
        resolved_path = input_path.resolve()
    except Exception as error:
        sys.exit(f"오류: 유효하지 않은 경로입니다: {error}")

    if not resolved_path.is_relative_to(ROOT):
        sys.exit(f"오류: 프로젝트 외부 경로의 파일은 읽을 수 없습니다: {resolved_path}")

    if not resolved_path.is_file():
        sys.exit(f"오류: 파일을 찾을 수 없습니다: {resolved_path}")

    # Reject forbidden credential filenames
    if any(kw in resolved_path.name.lower() for kw in FORBIDDEN_KEYWORDS):
        sys.exit(f"오류: 보안상 금지된 파일명입니다: {resolved_path.name}")

    # Bound input file size
    if resolved_path.stat().st_size > MAX_INPUT_BYTES:
        sys.exit("오류: 입력 파일 크기가 최대 허용치(1MB)를 초과했습니다.")

    try:
        reviewed = read_json(resolved_path)
    except Exception as error:
        sys.exit(f"오류: JSON 파싱 실패: {error}")

    current_today = read_json(TODAY_PATH)

    try:
        validate_reviewed_edition(reviewed, current_today)
    except ValueError as error:
        sys.exit(f"오류: {error}")

    merged = apply_reviewed_edition(reviewed, current_today)

    # Idempotency check
    if merged == current_today:
        print("기존 data/today.json과 완전히 동일한 내용입니다. 파일을 변경하지 않고 종료합니다.")
        sys.exit(0)

    # Atomic write to data/today.json
    write_json(TODAY_PATH, merged)
    print(f"[뉴스 보강 완료] data/today.json의 기사 {len(reviewed['articles'])}건에 편집 필드를 반영했습니다. (archive 총 {len(merged['articles'])}건)")


if __name__ == "__main__":
    main()
