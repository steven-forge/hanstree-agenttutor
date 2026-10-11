// Run from the project root: node scripts/check-card-news-auto-copy.cjs
// Pure source/data checks only. No network, credentials, store writes, or publication.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const content = {todayData: readJson('data/today.json'), newsEditorial: readJson('data/news-editorial.json'), glossaryTerms: readJson('data/glossary.json').terms};
const explore = readJson('data/explore.json');
const siteUrl = 'https://hanstree-agenttutor-jgwu.vercel.app';
const cache = new Map();
class AdminError extends Error {}
function load(relative) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.join(root, 'app/lib/card-news') + path.sep)) throw new Error('Source outside the allowed module directory');
  if (cache.has(file)) return cache.get(file).exports;
  const module = {exports: {}}; cache.set(file, module);
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true}, reportDiagnostics: true});
  assert.equal(result.diagnostics?.filter(item => item.category === ts.DiagnosticCategory.Error).length || 0, 0);
  vm.runInNewContext(result.outputText, {
    module, exports: module.exports, Date, URL, Intl,
    require: id => {
      if (id === 'server-only') return {};
      if (id === 'node:crypto') return require('node:crypto');
      if (id === '../../content') return content;
      if (id === '../../today/newsHelpers') return {SITE_URL: siteUrl, RELEASE_SOURCE_IDS: new Set(['codex-releases', 'claude-releases', 'gemini-releases', 'grok-releases'])};
      if (id === '../../../data/card-news-copy.json') return readJson('data/card-news-copy.json');
      if (id === '../../../data/explore.json') return explore;
      if (id === './server') return {AdminError};
      if (!/^\.\/(?:auto-copy|copy|manual|types)$/.test(id)) throw new Error('Unexpected source dependency');
      return load(path.relative(root, path.resolve(path.dirname(file), id + '.ts')));
    },
  }, {filename: file});
  return module.exports;
}
const {selectAutomaticCards, AutoCopyError, copyFor} = load('app/lib/card-news/auto-copy.ts');
const {fitCardCopy, wrapCardTitle, hasEllipsis, copyIssues, cardFontSize, cardBodyTop, wrapCardText, lineWidth, cardSourceLines, CARD_LAYOUT, CARD_SOURCE} = load('app/lib/card-news/copy.ts');
// S10 geometry and title sizing: no truncation, no extra wraps, text unchanged.
assert.equal(CARD_LAYOUT.split, 567); assert.equal(CARD_LAYOUT.left, 100); assert.equal(CARD_LAYOUT.contentWidth, 880);
assert.equal(CARD_LAYOUT.titleTop, 250); assert.equal(CARD_LAYOUT.titleLineHeight, 88.8); assert.equal(cardBodyTop('가\n나'), 650);
assert.equal(CARD_LAYOUT.bodyLineHeight, 67.2); assert.equal(CARD_SOURCE.top + 2 * CARD_SOURCE.lineHeight + 60, 1350);
assert.equal(cardFontSize('짧은 제목', 74), 74);
const longTitle = '가나다라마바사아자차카타파하가나\n가나다라마바사아자차카타파하가나';
assert.equal(lineWidth(longTitle.split('\n')[0]), 16); assert.equal(cardFontSize(longTitle, 74), 55);
assert.ok(lineWidth('가'.repeat(16)) * cardFontSize(longTitle, 74) <= 880);
assert.ok(cardFontSize('N'.repeat(24), 74) <= 48); assert.ok(cardFontSize('m'.repeat(24), 74) <= 37);
assert.ok(cardFontSize('N'.repeat(27), 48) <= 40); assert.equal(cardFontSize('가'.repeat(18), 48), 48);
const mSource = cardSourceLines({sourceName: 'm'.repeat(48), sourceUrl: 'https://example.com'});
assert.equal(mSource.length, 2); assert.equal(mSource.join('').replace(/\s/g, ''), '출처:' + 'm'.repeat(48));
assert.ok(cardFontSize(mSource.join('\n'), CARD_SOURCE.fontSize) <= 19);
assert.equal(wrapCardText(longTitle.replace('\n', ' '), 16), longTitle);
assert.equal(copyIssues({title: longTitle, body: '본문'}).length, 0);
// Title wrap: 16 first, 18 only when 16 exceeds two lines; never truncates, overlong stays blocked.
const asanaTitle = 'Asana, GPT-6.1 SOL로 브라우저 테스트에서 모델 비용 76배 절감';
assert.equal(wrapCardText(asanaTitle, 16).split('\n').length, 3);
const asanaWrapped = wrapCardTitle(asanaTitle);
assert.equal(asanaWrapped, wrapCardText(asanaTitle, 18)); assert.equal(asanaWrapped.split('\n').length, 2);
assert.equal(asanaWrapped.replace(/\s+/g, ''), asanaTitle.replace(/\s+/g, '')); assert.ok(!hasEllipsis(asanaWrapped));
assert.equal(cardFontSize(asanaWrapped, 74), 47);
assert.equal(wrapCardTitle('짧은 제목 확인'), '짧은 제목 확인');
assert.equal(wrapCardTitle(longTitle.replace('\n', ' ')), longTitle);
const asanaArticle = readJson('data/today.json').articles.find(a => a.id === '9bf93d58cc35db99');
assert.ok(asanaArticle && asanaArticle.source_summary_ko, 'Asana source summary must exist');
const asanaBody = asanaArticle.source_summary_ko;
const asanaFit = fitCardCopy({title: asanaTitle, body: asanaBody});
assert.ok(asanaFit, 'Asana copy must fit');
assert.equal(asanaFit.title.replace(/\s+/g, ''), asanaTitle.replace(/\s+/g, ''));
assert.equal(asanaFit.body.replace(/\s+/g, ''), asanaBody.replace(/\s+/g, ''));
assert.ok(asanaFit.body.split('\n').length <= 7);
assert.equal(copyFor({title: asanaTitle, summary: asanaBody}).copy.title, asanaWrapped);
const overlong = '가나다라마바사아자차카타파하가나다라마바 사아자차카타파하가나다라마바사아자차 카타파하가나다라마바사아자차카타파하';
assert.equal(fitCardCopy({title: overlong, body: '본문'}), null);
assert.ok(copyFor({title: overlong, summary: asanaBody}).reason);
assert.equal(fitCardCopy({title: '짧은 제목', body: '가'.repeat(18 * 7 + 1)}), null);
const {collectEdition} = load('app/lib/card-news/collect.ts');
const {supplementCandidates} = load('app/lib/card-news/supplements.ts');
const {candidateUrlKey} = load('app/lib/card-news/manual.ts');
const now = new Date('2026-10-06T14:00:00Z');
const titles = ['우주 관측 모델 공개', '전력 계약 확대', '병원 영상 분석 도입', '반도체 생산 시설 증설', '창작 도구 요금 변경', '정부 정보 공개 제도 개편', '로봇 공장 운영 시작', '학교 교사 교육 지원', '음성 인식 기술 개선', '검색 서비스 국가 확대', '소형 위성 통신 실험', '양자 오류 정정 연구', '번역 품질 평가 발표', '게임 엔진 보안 점검'];
function candidate(index, ageHours = index + 1) { return {id: `fixture-${index}`, title: titles[index], summary: '확인한 내용을 공개했다. 이용 조건도 함께 밝혔다.', sourceName: '격리 확인용 출처', sourceUrl: `https://example.org/story/${index}`, publishedAt: new Date(now.getTime() - ageHours * 3600000).toISOString(), datePrecision: 'time', origin: 'newsletter'}; }
let checks = 0;
function check(name, fn) { fn(); checks++; }
function failed(input, previous = [], hours = 168, previousIds = []) {
  try { selectAutomaticCards(input, previous, now, hours, previousIds); assert.fail('Insufficient candidates must fail'); }
  catch (error) { assert.ok(error instanceof AutoCopyError, error.message); return error.result; }
}
check('ten complete Korean cards retain facts and human-review false', () => {
  const input = titles.slice(0, 10).map((_, i) => candidate(i));
  const result = selectAutomaticCards(input.slice().reverse(), [], now);
  assert.equal(result.cards.length, 10); assert.equal(result.windowHours, 24);
  for (let i = 0; i < 10; i++) { const card = result.cards[i]; assert.equal(card.candidateId, input[i].id); assert.equal(card.verified, false); assert.equal(copyIssues(card).length, 0); assert.equal(card.body.replace(/\s+/g, ''), input[i].summary.replace(/\s+/g, '')); }
  assert.equal(input[0].summary, '확인한 내용을 공개했다. 이용 조건도 함께 밝혔다.');
});
check('prepared copy takes precedence over an overlong original title', () => {
  const item = {...candidate(0), title: '원래 제목이 매우 길어서 카드 두 줄 규격에 도저히 들어가지 않는 경우를 확인하는 제목입니다.', cardCopy: {title: '우주 관측 모델 공개', body: '개발사는 정확도가 높아졌다고 밝혔다. 독립 검증 결과는 아직 공개되지 않았다.'}};
  const result = selectAutomaticCards([item, ...titles.slice(1, 10).map((_, i) => candidate(i + 1))], [], now);
  assert.equal(result.selection[0].copySource, 'prepared'); assert.match(result.cards[0].body.replace(/\s/g, ''), /독립검증결과는아직공개되지않았다/);
});
check('24h then 72h then selected seven-day period', () => {
  const input = titles.slice(0, 10).map((_, i) => candidate(i, i < 4 ? i + 1 : i < 7 ? 30 + i : 80 + i));
  const result = selectAutomaticCards(input, [], now);
  assert.equal(result.windowHours, 168); assert.equal(result.selection.filter(item => item.ageHours <= 24).length, 4);
  assert.equal(failed(input, [], 72).eligibleCount, 7);
});
check('day-only future old and archived items do not count', () => {
  const cases = [{...candidate(0), datePrecision: 'day'}, candidate(1, -1), candidate(2, 169), {...candidate(3), origin: 'archive'}, {...candidate(4), origin: 'feed'}, {...candidate(5), publishedAt: '2026-10-06T09:00:00'}, {...candidate(6), publishedAt: '2026-02-30T09:00:00Z'}];
  const result = failed(cases); assert.equal(result.eligibleCount, 0); assert.equal(result.excluded.length, cases.length);
});
check('previous URLs canonicalize query order tracking fragments and trailing slash', () => {
  const item = {...candidate(0), sourceUrl: 'https://example.org/story/0/?b=2&UTM_SOURCE=x&a=1#section'};
  const result = failed([item], ['https://example.org/story/0?a=1&b=2']); assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /이전에 게시/);
});
check('duplicate article URLs and exact normalized headlines count once', () => {
  const first = candidate(0), urlDuplicate = {...candidate(1), sourceUrl: first.sourceUrl + '#duplicate'}, titleDuplicate = {...candidate(2), title: '우주  관측 모델, 공개!'};
  const result = failed([first, urlDuplicate, titleDuplicate]); assert.equal(result.eligibleCount, 1); assert.equal(result.excluded.length, 2);
});
check('an unfinished trailing condition prevents automatic selection', () => {
  const item = {...candidate(0), summary: '새 모델은 공개 자료에서 성능이 향상됐다고 밝혔다. 그러나 다음 단계는 아직'};
  const result = failed([item]); assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /미완성/);
});
check('different numbered model versions are not merged by boilerplate headlines', () => {
  const result = failed([{...candidate(0), title: '구글 모델 3 공개'}, {...candidate(1), title: '구글 모델 4 공개'}]); assert.equal(result.eligibleCount, 2);
});
check('a non-fitting contrast sentence cannot silently disappear', () => {
  const result = failed([{...candidate(0), summary: '새 기능을 공개했다. 다만 ' + '중요한 이용 제한을 설명하며 '.repeat(15) + '추가 확인이 필요하다고 밝혔다.'}]); assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /조건·제한/);
});
check('overlong lead is not replaced with unrelated shorter background', () => {
  const item = {...candidate(0), summary: '중요한 수치와 조건을 설명하며 '.repeat(30) + '발표했다. 짧은 배경 설명이다.'};
  const result = failed([item]); assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /첫 핵심 문장/);
});
check('overlong titles are excluded without cutting their text', () => {
  const result = failed([{...candidate(0), title: '의미와 조건을 모두 유지해야 하므로 자동으로 자르거나 생략해서는 안 되는 매우 긴 뉴스 제목입니다.'}]);
  assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /제목 전체/);
});
check('ellipsis and English body do not count as Korean completed copy', () => {
  const result = failed([{...candidate(0), summary: '기능을 공개했다... 이용 조건은 뒤에 나온다.'}, {...candidate(1), summary: 'The company announced a system today.'}, {...candidate(2), cardCopy: {title: '간단한 제목', body: '미완성 본문…'}, summary: '아직 완성되지 않은 요약'}]);
  assert.equal(result.eligibleCount, 0);
});
check('shortfall provides partial count and reasons instead of success', () => {
  const result = failed(titles.slice(0, 9).map((_, i) => candidate(i)));
  assert.equal(result.eligibleCount, 9); assert.equal(result.cards.length, 9);
});
check('promotional introductions do not become automatic news copy', () => {
  const summary = '새 기술을 적용하는 방법. 적용 위치와 이용 방법을 알아보세요.';
  const result = failed([{...candidate(0), summary, cardCopy: {title: '새 기술 적용 안내', body: summary}}]);
  assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /소개·안내/);
});
check('bounded selectable periods are enforced', () => {
  assert.throws(() => selectAutomaticCards([], [], now, 999));
  assert.throws(() => selectAutomaticCards([], [], new Date('invalid')));
  const input = titles.slice(0, 10).map((_, i) => candidate(i, 200 + i));
  assert.equal(selectAutomaticCards(input, [], now, 336).windowHours, 336);
});
function supplement(index, origin, overrides = {}) {
  const item = candidate(index);
  return {...item, id: `${origin}:fixture-${index}`, origin, sourceUrl: origin === 'glossary' ? `${siteUrl}/glossary#fixture-${index}` : origin === 'explore' ? `${siteUrl}/explore/fixture-${index}` : item.sourceUrl, ...(origin === 'glossary' ? {publishedAt: '', datePrecision: 'none'} : origin === 'explore' ? {publishedAt: '2026-10-05', datePrecision: 'day'} : {}), ...overrides};
}
check('supplements fill only missing cards in release glossary explore priority', () => {
  const news = titles.slice(0, 7).map((_, index) => candidate(index));
  const additional = [supplement(9, 'explore'), supplement(8, 'glossary'), supplement(7, 'release')];
  const result = selectAutomaticCards([...additional, ...news], [], now);
  assert.equal(result.cards.length, 10);
  assert.deepEqual(Array.from(result.cards.slice(0, 7), card => card.candidateId), news.map(item => item.id));
  assert.deepEqual(Array.from(result.cards.slice(7), card => card.candidateId), ['release:fixture-7', 'glossary:fixture-8', 'explore:fixture-9']);
  assert.ok(result.cards.every(card => card.verified === false));
});
check('ten eligible news items need no supplemental card', () => {
  const input = titles.slice(0, 10).map((_, index) => candidate(index));
  const result = selectAutomaticCards([supplement(10, 'release', {publishedAt: now.toISOString()}), supplement(11, 'glossary'), ...input], [], now);
  assert.ok(result.cards.every(card => card.candidateId.startsWith('fixture-')));
});
check('previous supplemental stable IDs remain excluded after URL changes', () => {
  const item = supplement(1, 'glossary', {sourceUrl: `${siteUrl}/glossary#renamed-reference`});
  const result = failed([item], [], 168, [item.id]);
  assert.equal(result.eligibleCount, 0);
  assert.match(result.excluded[0].reason, /이전|발행|게시/);
});
check('glossary fragment identities are distinct while article fragments are ignored', () => {
  const a = supplement(1, 'glossary'), b = supplement(2, 'glossary');
  assert.notEqual(candidateUrlKey(a.sourceUrl), candidateUrlKey(b.sourceUrl));
  assert.equal(candidateUrlKey('https://example.org/article#first'), candidateUrlKey('https://example.org/article#second'));
  assert.equal(failed([a, b]).eligibleCount, 2);
  assert.equal(failed([a, b], [a.sourceUrl]).eligibleCount, 1);
});
check('day-only supplements keep their precision while day-only news are rejected', () => {
  const result = failed([supplement(0, 'explore'), {...candidate(1), datePrecision: 'day', publishedAt: '2026-10-05'}, supplement(2, 'glossary')]);
  assert.equal(result.eligibleCount, 2);
  assert.equal(result.cards.find(card => card.candidateId.startsWith('explore:')).publishedAt, '2026-10-05');
  assert.equal(result.cards.find(card => card.candidateId.startsWith('glossary:')).publishedAt, '');
});
check('invalid future and too-old supplemental dates cannot fill a shortfall', () => {
  const result = failed([supplement(0, 'explore', {publishedAt: '2026-02-30'}), supplement(1, 'explore', {publishedAt: '2026-10-07'}), supplement(2, 'release', {publishedAt: '2026-09-01', datePrecision: 'day'})]);
  assert.equal(result.eligibleCount, 0);
});
check('fewer than ten news and supplements still returns a clear shortfall', () => {
  const result = failed([...titles.slice(0, 7).map((_, index) => candidate(index)), supplement(7, 'release'), supplement(8, 'glossary')]);
  assert.equal(result.eligibleCount, 9); assert.equal(result.cards.length, 9);
});
check('adapter preserves dates links and registration order without using global dates', () => {
  const original = {articles: content.todayData.articles, glossary: content.glossaryTerms, docs: explore.docs};
  try {
    content.todayData.articles = [
      {id: 'stable-release', title: '새 도구 버전 출시', source_id: 'codex-releases', source_name: 'Codex', source_url: 'https://github.com/example/tool/releases/tag/v1', published_at: '2026-10-05T10:00:00Z', release_notes_ko: {new_features: '아직 끝나지 않은 문장의\n종료할 때 메시지가 사라지는 문제를 수정했습니다.'}},
      {id: 'invalid-release', title: '새 도구 버전 출시', source_id: 'codex-releases', source_name: 'Codex', source_url: 'http://example.org/insecure', published_at: '2026-10-05T10:00:00Z', summary: '문제를 수정했습니다.'},
    ];
    content.glossaryTerms = [{id: 'old-term', term: 'Old', korean: '기존 용어', definition: '기존에 등록된 용어를 설명합니다.'}, {id: 'new-term', term: 'New', korean: '새 용어', definition: '새로 등록된 용어를 설명합니다.'}];
    explore.docs = [{slug: 'short-document', title: '도구 사용에 관한 의미가 완결된 원래 제목이지만 카드 두 줄에 들어가지 않을 만큼 아주 긴 원본 제목: 자세한 설명', summary: '검토를 돕는 도구입니다.', created_at: '2026-10-04', updated_at: '2026-10-05'}, {slug: 'valid-document', title: 'Tool: 아주 긴 제목과 다양한 이용 조건을 모두 확인할 수 있는 원본 문서의 설명', summary: '검토를 돕는 도구입니다. 실행 권한을 바꾸지 않습니다.', created_at: '2026-10-04', updated_at: '2026-10-05'}, {slug: 'future', title: '미래 문서', summary: '미래 문서입니다.', created_at: '2099-01-01'}, {slug: 'invalid-day', title: '날짜 오류', summary: '날짜 오류입니다.', created_at: '2026-02-30'}];
    const candidates = supplementCandidates('2026-10-06');
    const release = candidates.find(c => c.origin === 'release');
    assert.equal(release.id, 'release:stable-release'); assert.equal(release.publishedAt, '2026-10-05T10:00:00.000Z');
    assert.equal(release.summary, '종료할 때 메시지가 사라지는 문제를 수정했습니다.');
    assert.deepEqual(Array.from(candidates.filter(c => c.origin === 'glossary'), c => c.id), ['glossary:new-term', 'glossary:old-term']);
    for (const term of candidates.filter(c => c.origin === 'glossary')) { assert.equal(term.publishedAt, ''); assert.equal(term.datePrecision, 'none'); assert.ok(term.sourceUrl.includes('/glossary#')); }
    const docs = candidates.filter(c => c.origin === 'explore'); assert.equal(docs.length, 1); assert.equal(docs[0].id, 'explore:valid-document'); assert.equal(docs[0].title, 'Tool: 핵심 정리'); assert.equal(docs[0].datePrecision, 'day'); assert.equal(docs[0].publishedAt, '2026-10-05');
    for (const item of candidates) assert.equal(copyIssues(item.cardCopy).length, 0);
    assert.throws(() => supplementCandidates('2026-02-30'));
  } finally { content.todayData.articles = original.articles; content.glossaryTerms = original.glossary; explore.docs = original.docs; }
});
check('different English terms sharing a Korean translation keep distinct usable titles', () => {
  const original = content.glossaryTerms;
  try {
    content.glossaryTerms = [{id: 'inference', term: 'Inference', korean: '추론', definition: '학습된 모델로 입력의 결과를 계산하는 과정입니다.'}, {id: 'reasoning', term: 'Reasoning', korean: '추론', definition: '문제를 해결하기 위해 여러 논리 단계를 연결하는 과정입니다.'}];
    const terms = supplementCandidates('2026-10-06').filter(c => c.origin === 'glossary');
    assert.equal(terms.length, 2); assert.notEqual(terms[0].title, terms[1].title);
    assert.equal(failed(terms).eligibleCount, 2);
  } finally { content.glossaryTerms = original; }
});
// Conservative compression: compare primitive fields only (the module runs in another VM context).
const {compressKorean} = load('app/lib/card-news/auto-copy.ts');
const compressionSamples = [];
const bodyLines = text => wrapCardText(text, 18).split('\n').length;
const sample = (kind, before, after) => compressionSamples.push({kind, before: String(before).replace(/\n/g, ' '), after: String(after).replace(/\n/g, ' ')});
// Realistic news-style sentences. The body is 8 wrapped lines as written (the final "진행했습니다." wraps alone) and
// 7 lines after the wording "점검을 진행했습니다" becomes "점검을 했다"; the title is 3 lines before and 2 after.
const realBody = '국내 반도체 업체는 지난달 사내 인공지능 서버실의 전력 사용량과 냉각 설비 운영 효율을 높일 방안을 마련하기 위해 외부 전문 기관과 함께 사내 서버실 전체 전력 설비의 노후 장비를 교체하기로 하고 이달부터 전면 안전 점검을 진행했습니다.';
const realTitle = '인공지능 서버실 전력 설비 노후 장비 교체와 전면 안전 점검을 진행했습니다';
const realBodyAfter = realBody.replace('점검을 진행했습니다.', '점검을 했다.');
check('fixtures are genuinely over the limits before compression', () => {
  assert.equal(bodyLines(realBody), 8); assert.equal(bodyLines(realBodyAfter), 7);
  assert.ok(wrapCardTitle(realTitle).split('\n').length > 2);
});
check('overlong Korean title becomes two complete lines', () => {
  const copy = copyFor({title: realTitle, summary: '확인한 내용을 공개했습니다.'}).copy;
  assert.ok(copy && copy.title.split('\n').length <= 2 && copyIssues(copy).length === 0);
  assert.equal(copy.title.replace(/\s/g, ''), realTitle.replace('점검을 진행했습니다', '점검을 했다').replace(/\s/g, '')); assert.ok(!hasEllipsis(copy.title));
  sample('title', realTitle, copy.title);
});
check('overlong first sentence becomes seven lines and keeps every content word', () => {
  const candidateItem = Object.freeze({title: '안전 점검 결과 공개', summary: realBody});
  assert.equal(fitCardCopy({title: '안전 점검 결과 공개', body: realBody}), null);
  const result = copyFor(candidateItem), flat = result.copy.body.replace(/\s+/g, ' ');
  assert.equal(result.source, 'summary'); assert.ok(result.copy.body.split('\n').length <= 7); assert.equal(copyIssues(result.copy).length, 0);
  assert.equal(flat, realBodyAfter); assert.ok(!/[…]|\.\.\./.test(flat));
  assert.equal(candidateItem.summary, realBody);
  sample('summary', realBody, flat);
});
check('overlong prepared copy is compressed before falling back', () => {
  const result = copyFor({title: '원래 후보 제목', summary: '원래 후보 요약은 다른 문장입니다.', cardCopy: {title: realTitle, body: realBody}});
  assert.equal(result.source, 'prepared'); assert.equal(copyIssues(result.copy).length, 0);
  assert.ok(result.copy.title.replace(/\s/g, '').endsWith('안전점검을했다')); assert.equal(result.copy.body.replace(/\s+/g, ' '), realBodyAfter);
  sample('prepared', `${realTitle} / ${realBody}`, `${result.copy.title} / ${result.copy.body}`);
});
check('already fitting copy is returned exactly as before', () => {
  const fit = copyFor({title: '우주 관측 모델 공개', summary: '확인한 내용을 공개했습니다. 이용 조건도 함께 밝혔습니다.'}).copy;
  assert.equal(fit.title, '우주 관측 모델 공개'); assert.equal(fit.body.replace(/\n/g, ' '), '확인한 내용을 공개했습니다. 이용 조건도 함께 밝혔습니다.');
  assert.equal(copyFor({title: '짧은 제목', summary: '확인한 내용을 공개했습니다.', cardCopy: {title: '준비한 제목', body: '준비한 본문을 그대로 사용합니다.'}}).copy.body.replace(/\n/g, ' '), '준비한 본문을 그대로 사용합니다.');
});
check('compression keeps names, numbers, bounds, negation, plans, claims and quotes', () => {
  const cases = [
    ['GPT-6.1 SOL은 비용을 최대 76배까지 줄일 수 있다고 회사가 주장했습니다.', 'GPT-6.1 SOL은 비용을 최대 76배까지 줄일 수 있다고 회사가 주장했다.'],
    ['업체는 올해 도입 계획이 없습니다.', '업체는 올해 도입 계획이 없다.'],
    ['출시는 내년 이후로 검토 중이며 예정입니다.', '출시는 내년 이후로 검토 중이며 예정이다.'],
    ['이 기능은 일부 지역에서 제공되지 않습니다.', '이 기능은 일부 지역에서 제공되지 않습니다.'],
    ['정부는 “안전하다고 판단합니다.” 라고 전망했습니다.', '정부는 “안전하다고 판단합니다.” 라고 전망했다.'],
    ['한화솔루션은 점검을 진행했습니다. 또한 결과를 공개합니다.', '한화솔루션은 점검을 했다. 또한 결과를 공개한다.'],
    ['AI의 이름을 바꾸려는 트럼프의 시도는 끔찍하게 인위적으로 보입니다.', 'AI의 이름을 바꾸려는 트럼프의 시도는 끔찍하게 인위적으로 보인다.'],
    ['이 설정은 비용을 크게 줄입니다. 이 규정은 필요합니다.', '이 설정은 비용을 크게 줄입니다. 이 규정은 필요합니다.'],
    ['LibreOffice는 ‘no AI’ 가 이제 소프트웨어 기능이라고 말합니다.', 'LibreOffice는 ‘no AI’ 가 이제 소프트웨어 기능이라고 말한다.'],
    ["회사는 'open-source' 모드를 3개 모델에 지원합니다.", "회사는 'open-source' 모드를 3개 모델에 지원한다."],
    ['새로운 점검을 진행했습니다.', '새로운 점검을 했다.'],
    ['회사에 맞는 교육을 실시했습니다.', '회사에 맞는 교육을 했다.'],
    ['이 모델은 이미 공개된 것입니다.', '이 모델은 이미 공개된 것이다.'],
  ];
  for (const [before, after] of cases) assert.equal(compressKorean(before), after);
  sample('semantic', cases[0][0], compressKorean(cases[0][0])); sample('semantic', cases[4][0], compressKorean(cases[4][0]));
  sample('semantic', cases[6][0], compressKorean(cases[6][0])); sample('semantic', cases[8][0], compressKorean(cases[8][0]));
});
check('compressed output still cannot drop a following limitation sentence', () => {
  const result = failed([{...candidate(0), summary: '새 기능을 공개했습니다. 다만 ' + '이러한 중요한 이용 제한을 설명하며 '.repeat(15) + '추가 확인이 필요합니다.'}]);
  assert.equal(result.eligibleCount, 0); assert.match(result.excluded[0].reason, /조건·제한/);
});
check('incompressible long copy still fails with a concrete reason', () => {
  const result = copyFor({title: '안전 점검 결과 공개', summary: '중요한 수치와 조건을 설명하며 '.repeat(30) + '발표했습니다.'});
  assert.equal(result.copy, undefined); assert.match(result.reason, /첫 핵심 문장/);
});
check('automatic selection compresses without changing candidate or review state', () => {
  const summary = realBody, input = titles.slice(0, 10).map((_, i) => candidate(i));
  input[0] = {...input[0], summary};
  const result = selectAutomaticCards(input, [], now);
  const card = result.cards.find(item => item.candidateId === 'fixture-0');
  assert.ok(card && card.verified === false && copyIssues(card).length === 0); assert.equal(input[0].summary, summary);
});
(async () => {
  const actualNow = new Date(), date = new Date(actualNow.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const edition = await collectEdition(date, null);
  // Collection: valid prepared 2/7 copy, complete-lead summary fallback, oversized Korean kept whole (never cut or blanked).
  const verge = edition.candidates.find(item => item.newsletterId === 'd55dd9b285d68fe3');
  assert.ok(verge && verge.cardCopy, 'prepared Verge copy must apply'); assert.equal(copyIssues(verge.cardCopy).length, 0);
  assert.equal(verge.cardCopy.title.split('\n').length, 2); assert.ok(verge.cardCopy.body.split('\n').length <= 7); assert.match(verge.cardCopy.body, /해고 사유로 밝혔다/);
  const holmes = edition.candidates.find(item => item.newsletterId === '24278ccc21fb5421');
  assert.ok(holmes && holmes.cardCopy, 'prepared Holmes copy must apply'); assert.equal(copyIssues(holmes.cardCopy).length, 0);
  assert.ok(holmes.cardCopy.title.split('\n').length <= 2 && holmes.cardCopy.body.split('\n').length <= 7);
  assert.match(holmes.cardCopy.body, /1천/); assert.doesNotMatch(holmes.cardCopy.body, /기자|reporter/i);
  const sentence = i => `회사는 ${i}번째 안전 점검 결과를 공개했다.`;
  const longLead = Array.from({length: 9}, (_, i) => sentence(i + 1)).join(' ');
  const oversized = '중요한 수치와 조건을 설명하며 '.repeat(12) + '발표했다.';
  const stamp = new Date(actualNow.getTime() - 3600000).toISOString(), originalArticles = content.todayData.articles;
  try {
    content.todayData.articles = [
      {id: 'lead-fallback', title: '안전 점검 결과 공개', summary: longLead, source_id: 'news', source_name: '출처', source_url: 'https://example.org/lead', published_at: stamp},
      {id: 'oversized', title: '안전 점검 결과 공개', summary: oversized, source_id: 'news', source_name: '출처', source_url: 'https://example.org/oversized', published_at: stamp},
    ];
    const {candidates} = await collectEdition(date, null);
    const lead = candidates.find(item => item.newsletterId === 'lead-fallback'), big = candidates.find(item => item.newsletterId === 'oversized');
    const flat = lead.cardCopy.body.replace(/\s+/g, ' ');
    assert.equal(copyIssues(lead.cardCopy).length, 0); assert.ok(flat.length < longLead.length && longLead.startsWith(flat) && /\.$/.test(flat) && !/[…]/.test(flat));
    assert.equal(big.cardCopy, undefined); assert.equal(big.summary, oversized);
  } finally { content.todayData.articles = originalArticles; }
  const supplements = supplementCandidates(date);
  const summaries = [];
  for (const hours of [72, 168, 336, 720]) {
    let result, success = true;
    try { result = selectAutomaticCards(edition.candidates, [], actualNow, hours); }
    catch (error) { if (!(error instanceof AutoCopyError)) throw error; result = error.result; success = false; }
    const reasons = {};
    for (const item of result.excluded) reasons[item.reason] = (reasons[item.reason] || 0) + 1;
    summaries.push({maxAgeHours: hours, success, eligible: result.eligibleCount, selected: result.cards.length, prepared: result.selection.filter(item => item.copySource === 'prepared').length, windowHours: result.windowHours, exclusions: reasons, selectedHeadlines: result.cards.map(item => ({title: item.title.replace(/\n/g, ' '), publishedAt: item.publishedAt}))});
    if (hours === 168 && success) {
      let next;
      try { next = selectAutomaticCards(edition.candidates, result.cards.map(card => card.sourceUrl), actualNow, hours); }
      catch (error) { if (!(error instanceof AutoCopyError)) throw error; next = error.result; }
      summaries[summaries.length - 1].remainingAfterFirstTen = next.eligibleCount;
    }
  }
  const withSupplements = [];
  for (const hours of [72, 168]) {
    let result;
    try { result = selectAutomaticCards([...edition.candidates, ...supplements], [], actualNow, hours); }
    catch (error) { if (!(error instanceof AutoCopyError)) throw error; result = error.result; }
    const origins = result.cards.map(card => [...edition.candidates, ...supplements].find(c => c.id === card.candidateId).origin);
    const eligibleByOrigin = {};
    for (const origin of ['release', 'glossary', 'explore']) {
      let partial;
      try { partial = selectAutomaticCards(supplements.filter(c => c.origin === origin), [], actualNow, hours); }
      catch (error) { if (!(error instanceof AutoCopyError)) throw error; partial = error.result; }
      eligibleByOrigin[origin] = partial.eligibleCount;
    }
    withSupplements.push({hours, eligible: result.eligibleCount, selected: result.cards.length, origins, eligibleByOrigin});
  }
  console.log(JSON.stringify({checks, passed: true, compressionSamples, at: actualNow.toISOString(), newsletterCandidates: edition.candidates.length, supplements: {release: supplements.filter(c => c.origin === 'release').length, glossary: supplements.filter(c => c.origin === 'glossary').length, explore: supplements.filter(c => c.origin === 'explore').length}, actualData: summaries, withSupplements, externalRequests: 0}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
