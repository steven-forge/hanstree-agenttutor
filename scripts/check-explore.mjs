import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { decideOutcome, SELECTION_OPTIONS } from "../app/explore/decisionLogic.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = join(here, "../public");
const explore = JSON.parse(readFileSync(join(here, "../data/explore.json"), "utf8"));

function checkImage(image, label) {
  assert.ok(image.src && image.src.startsWith("/"), `${label} 이미지 src는 /로 시작해야 합니다`);
  assert.ok(existsSync(join(publicDir, image.src)), `${label} 이미지 파일이 없습니다: ${image.src}`);
  assert.ok(image.alt && image.alt.trim() !== "", `${label} 이미지에 alt가 필요합니다`);
  assert.ok(image.caption && image.caption.trim() !== "", `${label} 이미지에 caption이 필요합니다`);
  assert.ok(image.width > 0 && image.height > 0, `${label} 이미지의 width/height는 실제 치수(양수)로 채워야 합니다`);
}

// data/explore.json integrity
assert.ok(Array.isArray(explore.docs) && explore.docs.length > 0, "explore.json에 docs 배열이 있어야 합니다");

const slugs = new Set();
const requiredFields = [
  "slug", "title", "summary", "topic", "tags", "created_at", "updated_at",
  "reviewed_at", "question", "core_answer", "easy_explanation", "api_explanation",
  "details", "comparison_note", "pitfalls", "sources"
];

for (const doc of explore.docs) {
  for (const field of requiredFields) {
    assert.ok(doc[field] !== undefined && doc[field] !== "", `${doc.slug ?? "(no slug)"} 문서에 ${field} 필드가 필요합니다`);
  }
  assert.ok(!slugs.has(doc.slug), `slug가 중복됩니다: ${doc.slug}`);
  slugs.add(doc.slug);
  assert.ok(Array.isArray(doc.sources) && doc.sources.length > 0, `${doc.slug} 문서에 출처가 1개 이상 필요합니다`);

  if (doc.diagram_image) checkImage(doc.diagram_image, `${doc.slug} diagram_image`);

  if (doc.comparison) {
    const { table, jev_outcomes, comparison_image, sources } = doc.comparison;
    assert.ok(Array.isArray(table?.rows) && table.rows.length > 0, `${doc.slug} comparison.table.rows가 필요합니다`);
    for (const row of table.rows) {
      assert.ok(row.label && row.decisions && row.jev, `${doc.slug} comparison 표의 각 행에 label/decisions/jev가 필요합니다`);
    }
    assert.ok(Array.isArray(jev_outcomes) && jev_outcomes.length === 3, `${doc.slug} comparison.jev_outcomes는 3개여야 합니다`);
    assert.ok(Array.isArray(sources) && sources.length > 0, `${doc.slug} comparison.sources가 필요합니다`);
    checkImage(comparison_image, `${doc.slug} comparison_image`);
  }
}

// decideOutcome pure logic: cover every preset outcome combination
assert.deepEqual(
  decideOutcome({ selection: "shipping", hasShippingInfo: true, routeAllToAgent: false }).outcome,
  "auto"
);
assert.deepEqual(
  decideOutcome({ selection: "shipping", hasShippingInfo: false, routeAllToAgent: false }).outcome,
  "moreInfo"
);
assert.deepEqual(
  decideOutcome({ selection: "refund", hasShippingInfo: true, routeAllToAgent: false }).outcome,
  "agent"
);
assert.deepEqual(
  decideOutcome({ selection: "insufficient", hasShippingInfo: true, routeAllToAgent: false }).outcome,
  "moreInfo"
);
// policy override wins regardless of selection
for (const selection of SELECTION_OPTIONS) {
  assert.deepEqual(
    decideOutcome({ selection, hasShippingInfo: true, routeAllToAgent: true }).outcome,
    "agent"
  );
}

console.log("check-explore: OK");
