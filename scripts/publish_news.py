#!/usr/bin/env python3
"""검토된 뉴스 판본을 검증하고 data/today.json을 원자적으로 교체 발행하는 스크립트"""

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
CANDIDATES_PATH = DATA_DIR / "today-candidates.json"
HEALTH_PATH = DATA_DIR / "content-health.json"
KST = timezone(timedelta(hours=9))
MAX_INPUT_BYTES = 1 * 1024 * 1024  # 1MB
FORBIDDEN_KEYWORDS = [".env", "login", "auth", "credential", "secret", "password", "id_rsa"]


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


def validate_reviewed_edition(reviewed: dict, candidates_data: dict, health_data: dict, current_today: dict) -> None:
    if not all(isinstance(value, dict) for value in (reviewed, candidates_data, health_data, current_today)):
        raise ValueError("판본·후보·상태 데이터는 JSON 객체여야 합니다.")
    # Top-level required fields
    required_fields = ["edition_date", "window_start", "window_end", "collected_at", "reviewed_at", "articles"]
    if set(reviewed) != set(required_fields):
        raise ValueError("판본에는 지정된 필수 필드만 허용됩니다.")
    for field in required_fields:
        if field not in reviewed:
            raise ValueError(f"필수 필드 '{field}'가 누락되었습니다.")
        if field != "articles":
            if not isinstance(reviewed[field], str) or not reviewed[field].strip():
                raise ValueError(f"필드 '{field}'는 비어 있지 않은 문자열이어야 합니다.")

    if not candidates_data or not candidates_data.get("collected_at"):
        raise ValueError("유효한 수집 기록이 없습니다. 먼저 python3 scripts/collect_content.py news 를 실행하세요.")

    # Generation match check: candidates_data vs health_data
    news_health = health_data.get("news", {})
    if news_health.get("checked_at") != candidates_data.get("collected_at"):
        raise ValueError("후보 수집 시각(collected_at)과 헬스 점검 시각(checked_at)이 일치하지 않습니다.")

    # Window / collection times matching
    for field in ["window_start", "window_end", "collected_at"]:
        if reviewed.get(field) != candidates_data.get(field):
            raise ValueError(f"'{field}' 값이 최신 후보 파일의 값과 일치하지 않습니다.\n  기대치: {candidates_data.get(field)}\n  입력값: {reviewed.get(field)}")

    # Time validations
    now_utc = datetime.now(timezone.utc)
    try:
        rev_dt = datetime.fromisoformat(reviewed["reviewed_at"])
        if rev_dt.tzinfo is None:
            raise ValueError("reviewed_at에 시간대(Timezone) 정보가 없습니다.")
    except Exception as error:
        raise ValueError(f"reviewed_at ISO 시각 형식이 올바르지 않습니다: {error}")

    try:
        coll_dt = datetime.fromisoformat(candidates_data["collected_at"])
        if coll_dt.tzinfo is None:
            raise ValueError("collected_at에 시간대(Timezone) 정보가 없습니다.")
    except Exception as error:
        raise ValueError(f"collected_at 시각 검증 실패: {error}")

    try:
        w_start = datetime.fromisoformat(reviewed["window_start"])
        if w_start.tzinfo is None:
            raise ValueError("window_start에 시간대(Timezone) 정보가 없습니다.")
    except Exception as error:
        raise ValueError(f"window_start 시각 검증 실패: {error}")

    try:
        w_end = datetime.fromisoformat(reviewed["window_end"])
        if w_end.tzinfo is None:
            raise ValueError("window_end에 시간대(Timezone) 정보가 없습니다.")
    except Exception as error:
        raise ValueError(f"window_end 시각 검증 실패: {error}")

    # Window exact 24 hours and not future
    if w_end > now_utc + timedelta(minutes=5):
        raise ValueError(f"window_end 시각({reviewed['window_end']})은 현재 시각보다 미래일 수 없습니다.")
    if abs((w_end - w_start).total_seconds() - 86400) > 1:
        raise ValueError("수집 윈도우 기간은 정확히 24시간이어야 합니다.")
    if coll_dt != w_end:
        raise ValueError("수집 시각과 수집 기간의 종료 시각이 일치해야 합니다.")

    # Allow up to 5 minutes clock skew for reviewed_at
    if rev_dt > now_utc + timedelta(minutes=5):
        raise ValueError(f"reviewed_at 시각({reviewed['reviewed_at']})은 현재 시각보다 미래일 수 없습니다.")

    if rev_dt < coll_dt:
        raise ValueError(f"reviewed_at({reviewed['reviewed_at']})은 수집 시각({candidates_data['collected_at']}) 이후여야 합니다.")

    # edition_date must match window_end KST date
    window_end_dt = w_end.astimezone(KST)
    expected_edition_date = window_end_dt.strftime("%Y-%m-%d")
    if reviewed["edition_date"] != expected_edition_date:
        raise ValueError(f"edition_date({reviewed['edition_date']})가 수집 종료 KST 날짜({expected_edition_date})와 일치하지 않습니다.")

    # Articles validation
    articles = reviewed.get("articles")
    if not isinstance(articles, list):
        raise ValueError("articles는 기사 목록 배열이어야 합니다.")

    if len(articles) > 10:
        raise ValueError(f"발행 기사 수는 최대 10개까지 허용됩니다 (현재 {len(articles)}개).")

    candidates_list = candidates_data.get("candidates", [])
    cand_by_id = {c["id"]: c for c in candidates_list if isinstance(c, dict) and "id" in c}

    total_held = sum(s.get("held_count", 0) for s in news_health.get("sources", []))
    total_failed = sum(1 for s in news_health.get("sources", []) if s.get("status") == "failed")

    if len(articles) == 0:
        if len(candidates_list) != 0 or news_health.get("status") != "ok" or total_held > 0 or total_failed > 0:
            raise ValueError("빈 에디션 발행은 최근 수집 후보가 0건이고 보류나 실패 출처가 전혀 없는 정상(ok) 상태일 때만 허용됩니다.")
    else:
        if news_health.get("status") not in ("ok", "partial"):
            raise ValueError("정상 또는 부분 수집 상태의 후보만 발행할 수 있습니다.")

        seen_ids = set()
        seen_urls = set()
        article_required_fields = ["id", "title", "summary", "why_it_matters", "source_id", "source_name", "source_url", "published_at"]

        for idx, art in enumerate(articles, start=1):
            if not isinstance(art, dict):
                raise ValueError(f"{idx}번째 기사 항목이 객체(dict) 형식이 아닙니다.")
            if set(art) != set(article_required_fields):
                raise ValueError(f"{idx}번째 기사에는 지정된 필수 필드만 허용됩니다.")

            for af in article_required_fields:
                val = art.get(af)
                if not isinstance(val, str) or not val.strip():
                    raise ValueError(f"{idx}번째 기사({art.get('id', 'ID미상')})의 필수 필드 '{af}'가 문자열이 아니거나 비어 있습니다.")

            art_id = art["id"]
            if art_id in seen_ids:
                raise ValueError(f"중복된 기사 ID가 발견되었습니다: {art_id}")
            seen_ids.add(art_id)

            art_url = art["source_url"]
            try:
                validate_url(art_url)
            except ValueError as error:
                raise ValueError(f"기사 '{art_id}'의 출처 URL 검증 실패: {error}")

            if art_url in seen_urls:
                raise ValueError(f"중복된 기사 출처 URL이 발견되었습니다: {art_url}")
            seen_urls.add(art_url)

            # Check Korean text presence in summary and why_it_matters
            if not re.search(r'[\uac00-\ud7a3]', art["summary"]):
                raise ValueError(f"기사 '{art_id}'의 summary에 한국어 설명이 누락되었습니다.")
            if not re.search(r'[\uac00-\ud7a3]', art["why_it_matters"]):
                raise ValueError(f"기사 '{art_id}'의 why_it_matters에 한국어 설명이 누락되었습니다.")

            # Check published_at timezone and inside window
            try:
                art_dt = datetime.fromisoformat(art["published_at"])
                if art_dt.tzinfo is None:
                    raise ValueError(f"기사 '{art_id}'의 published_at에 시간대 정보가 없습니다.")
            except Exception as error:
                raise ValueError(f"기사 '{art_id}'의 published_at ISO 형식 오류: {error}")

            if not (w_start <= art_dt <= w_end):
                raise ValueError(f"기사 '{art_id}'의 발행 시각({art['published_at']})이 수집 윈도우 범위를 벗어납니다.")

            # Match with collected candidate evidence
            cand = cand_by_id.get(art_id)
            if not cand:
                raise ValueError(f"기사 ID '{art_id}'는 수집된 후보 목록에 존재하지 않습니다.")

            for match_key in ["source_id", "source_name", "source_url", "published_at"]:
                if art[match_key] != cand.get(match_key):
                    raise ValueError(f"기사 '{art_id}'의 {match_key} 값('{art[match_key]}')이 수집된 후보의 값('{cand.get(match_key)}')과 일치하지 않습니다.")

    # Anti-regression check against current today.json: edition_date + collected_at monotonic
    curr_edition = current_today.get("edition_date")
    new_edition = reviewed.get("edition_date")
    if curr_edition and new_edition:
        if new_edition < curr_edition:
            raise ValueError(f"이미 최신 판본({curr_edition})이 공개되어 있으므로 이전 과거 판본({new_edition})으로 되돌릴 수 없습니다.")
        if new_edition == curr_edition:
            curr_coll = current_today.get("collected_at")
            new_coll = reviewed.get("collected_at")
            if curr_coll and new_coll:
                try:
                    previous_collection = datetime.fromisoformat(curr_coll)
                    incoming_collection = datetime.fromisoformat(new_coll)
                    is_older = incoming_collection < previous_collection
                except (ValueError, TypeError) as error:
                    raise ValueError("기존 공개본의 수집 시각을 확인할 수 없습니다.") from error
                if is_older:
                    raise ValueError("동일 날짜의 더 오래된 수집본으로 되돌릴 수 없습니다.")


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("사용법: python3 scripts/publish_news.py <프로젝트-내-reviewed-edition.json>")
        print("수집된 후보와 검토 결과를 검증한 후 data/today.json을 안전하게 원자적 교체합니다.")
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

    candidates_data = read_json(CANDIDATES_PATH)
    health_data = read_json(HEALTH_PATH)
    current_today = read_json(TODAY_PATH)

    try:
        validate_reviewed_edition(reviewed, candidates_data, health_data, current_today)
    except ValueError as error:
        sys.exit(f"오류: {error}")

    # Idempotency check
    if reviewed == current_today:
        print("기존 data/today.json과 완전히 동일한 내용입니다. 파일을 변경하지 않고 종료합니다.")
        sys.exit(0)

    # Atomic write to data/today.json
    write_json(TODAY_PATH, reviewed)
    print(f"[뉴스 발행 완료] data/today.json이 성공적으로 갱신되었습니다. (판본일: {reviewed.get('edition_date')}, 기사 수: {len(reviewed.get('articles', []))}개)")


if __name__ == "__main__":
    main()
