import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";
import { decideOutcome, SELECTION_OPTIONS } from "../app/explore/decisionLogic.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const explore = JSON.parse(readFileSync(join(here, "../data/explore.json"), "utf8"));

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
