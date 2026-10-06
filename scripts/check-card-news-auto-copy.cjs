// Run from the project root: node scripts/check-card-news-auto-copy.cjs
// Pure source/data checks only. No network, credentials, store writes, or publication.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const readJson = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const content = {todayData: readJson('data/today.json'), newsEditorial: readJson('data/news-editorial.json')};
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
      if (id === '../../today/newsHelpers') return {RELEASE_SOURCE_IDS: new Set(['codex-releases', 'claude-releases', 'gemini-releases', 'grok-releases'])};
      if (id === '../../../data/card-news-copy.json') return readJson('data/card-news-copy.json');
      if (id === './server') return {AdminError};
      if (!/^\.\/(?:copy|manual|types)$/.test(id)) throw new Error('Unexpected source dependency');
      return load(path.relative(root, path.resolve(path.dirname(file), id + '.ts')));
    },
  }, {filename: file});
  return module.exports;
}
const {selectAutomaticCards, AutoCopyError} = load('app/lib/card-news/auto-copy.ts');
const {copyIssues} = load('app/lib/card-news/copy.ts');
const {collectEdition} = load('app/lib/card-news/collect.ts');
const now = new Date('2026-10-06T14:00:00Z');
const titles = ['우주 관측 모델 공개', '전력 계약 확대', '병원 영상 분석 도입', '반도체 생산 시설 증설', '창작 도구 요금 변경', '정부 정보 공개 제도 개편', '로봇 공장 운영 시작', '학교 교사 교육 지원', '음성 인식 기술 개선', '검색 서비스 국가 확대', '소형 위성 통신 실험', '양자 오류 정정 연구', '번역 품질 평가 발표', '게임 엔진 보안 점검'];
function candidate(index, ageHours = index + 1) { return {id: `fixture-${index}`, title: titles[index], summary: '확인한 내용을 공개했다. 이용 조건도 함께 밝혔다.', sourceName: '격리 확인용 출처', sourceUrl: `https://example.org/story/${index}`, publishedAt: new Date(now.getTime() - ageHours * 3600000).toISOString(), datePrecision: 'time', origin: 'newsletter'}; }
let checks = 0;
function check(name, fn) { fn(); checks++; }
function failed(input, previous = [], hours = 168) {
  try { selectAutomaticCards(input, previous, now, hours); assert.fail('Insufficient candidates must fail'); }
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
(async () => {
  const actualNow = new Date(), date = new Date(actualNow.getTime() + 9 * 3600000).toISOString().slice(0, 10);
  const edition = await collectEdition(date, null);
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
  console.log(JSON.stringify({checks, passed: true, at: actualNow.toISOString(), newsletterCandidates: edition.candidates.length, actualData: summaries, externalRequests: 0}, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
