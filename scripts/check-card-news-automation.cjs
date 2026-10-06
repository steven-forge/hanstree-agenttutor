// node scripts/check-card-news-automation.cjs — isolated clocks, storage and Instagram; never publishes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const root = path.resolve(__dirname, '..'), base = path.join(root, 'app/lib/card-news');
const clone = x => JSON.parse(JSON.stringify(x));
let checks = 0;
async function check(name, fn) { await fn(); checks++; console.log('OK', name); }
function harness(realInstagram = false) {
  const h = { now: Date.parse('2026-10-07T00:00:00Z'), store: new Map(), editions: new Map(), renders: 0, publishes: 0, children: 0, recent: null, remoteStatus: 'FINISHED', ambiguous: false, authRejected: false, malformed: false, hook: null, onRender: null, candidates: null, supplements: [], supplementCalls: 0 };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [h.now])); } static now() { return h.now; } }
  const iso = () => new Clock().toISOString();
  class AdminError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
  class Cooldown extends AdminError { constructor(at) { super('최근 게시로부터 1시간 대기', 409); this.nextAllowedAt=at; } }
  const prefix='cardnews:{admin}:';
  async function redis(command, ...args) {
    if(command==='GET') return h.store.get(args[0]) ?? null;
    if(command==='SET') { if(args.includes('NX') && h.store.has(args[0])) return null; h.store.set(args[0],args[1]); return 'OK'; }
    if(command==='DEL') return +h.store.delete(args[0]);
    if(command==='ZREVRANGE') return Array.from(h.editions.keys()).reverse().slice(Number(args[1]),Number(args[2]) < 0 ? undefined : Number(args[2])+1);
    if(command==='MGET') return args.map(k=>h.editions.has(k.split(':').at(-1))?JSON.stringify(h.editions.get(k.split(':').at(-1))):null);
    if(command==='EVAL') {
      const [script, n, key, a, b] = args; assert.equal(n,1);
      if(script.includes("redis.call('SET',KEYS[1],ARGV[2])") && !script.includes('local rev=0')) { if(h.store.get(key)!==a)return 0;h.store.set(key,b);return 1; }
      if(script.includes('local rev=0')) {
        const rev=h.store.has(key)?JSON.parse(h.store.get(key)).revision:0;
        if(rev!==a) return 0; h.store.set(key,b); return 1;
      }
      if(h.store.get(key)===a) { h.store.delete(key); return 1; } return 0;
    }
    throw Error('Unexpected Redis command '+command);
  }
  const server={AdminError,prefix,redis,setupStatus:()=>({scheduler:true}),equalSecret:(a,b)=>a===b,signAsset:()=> 'isolated-signature',getEdition:async date=>h.editions.has(date)?clone(h.editions.get(date)):null,putEdition:async(e,expected)=>{
    if((h.editions.get(e.date)?.revision||0)!==expected) throw new AdminError('revision conflict',409);
    const next=clone({...e,revision:expected+1,updatedAt:iso()});h.editions.set(e.date,next);return clone(next);
  }};
  const cards=()=>Array.from({length:10},(_,i)=>({candidateId:String(i),title:`뉴스 ${i}`,body:'새 기능을 공개했다.',sourceName:'확인 출처',sourceUrl:`https://example.org/${i}`,publishedAt:new Clock(h.now-3600000).toISOString(),verified:false}));
  h.edition=(date='2026-10-07')=>({date,revision:1,status:'approved',windowStart:new Clock(h.now-86400000).toISOString(),windowEnd:new Clock(h.now+86400000).toISOString(),collectedAt:iso(),updatedAt:iso(),cards:cards().map(c=>({...c,verified:true})),candidates:cards().map(c=>({id:c.candidateId,title:c.title,summary:c.body,sourceName:c.sourceName,sourceUrl:c.sourceUrl,publishedAt:c.publishedAt,datePrecision:'time',origin:'newsletter'})),caption:'설명',sources:[]});
  const instagramMock={PublishCooldown:Cooldown,instagramAccount:async()=>({id:'123',username:'test-account'}),latestInstagramPublication:async()=>{
    if(h.hook) await h.hook(); return {accountId:'123',nextAllowedAt:new Clock(h.recent?h.recent+3600000:0).toISOString()};
  },publishEdition:async(e,account,opts)=>{await opts.beforePublish();h.publishes++;return server.putEdition({...e,status:'published',publishedAt:iso(),publication:{attempt:'attempt',children:[],accountId:account}},e.revision);},reconcileEdition:async(e,opts)=>{await opts.beforePublish();return e;}};
  const content={todayData:{get collected_at(){return iso();}}};
  const cache=new Map();
  function load(name) {
    if(cache.has(name)) return cache.get(name).exports;
    const filename=path.join(base,name+'.ts'), module={exports:{}};cache.set(name,module);
    const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
    vm.runInNewContext(source,{module,exports:module.exports,Date:Clock,URL,Intl,Buffer,AbortSignal,process:{env:{CARD_NEWS_PUBLIC_URL:'https://example.org'}},fetch:async url=>{
      const endpoint=new URL(url).pathname;
      if(endpoint.endsWith('/media_publish')) { h.publishes++;if(h.ambiguous)throw Error('timeout');if(h.authRejected)return {ok:false,status:400,json:async()=>({error:{code:190}})};h.recent=h.now;return {ok:true,json:async()=>({id:'999'})}; }
      if(endpoint.endsWith('/media') && new URL(url).search) return {ok:true,json:async()=>h.malformed?{}:{data:h.recent?[{id:'1',timestamp:new Clock(h.recent).toISOString()}]:[]}};
      if(endpoint.endsWith('/media')) {h.children++;return {ok:true,json:async()=>({id:String(100+h.children)})};}
      return {ok:true,json:async()=>new URL(url).searchParams.get('fields')==='permalink'?{permalink:'https://www.instagram.com/p/example/'}:{status_code:h.remoteStatus}};
    },require:id=>{
      if(id==='server-only')return {};
      if(id==='node:crypto')return require(id);
      if(id==='../../content')return content;
      if(id==='./server')return server;
      if(id==='./render')return {renderCard:async()=>{h.renders++;if(h.onRender)await h.onRender();return Buffer.from('isolated');}};
      if(id==='./collect')return {collectEdition:async(date,old)=>({...h.edition(date),revision:old?.revision||0,status:'draft',cards:[],candidateSource:'newsletter',candidates:h.candidates||h.edition(date).candidates})};
      if(id==='./supplements')return {supplementCandidates:()=>{h.supplementCalls++;return h.supplements;}};
      if(id==='./instagram'&&!realInstagram)return instagramMock;
      if(id==='./instagram-connection')return {apiVersion:()=> 'v26.0',assertCredentialsCurrent:async()=>{},resolveCredentials:async()=>({token:'isolated-not-a-real-token',userId:'123'}),verifyIdentity:async()=>({user_id:'123',username:'test-account'})};
      if(/^\.\/[a-z-]+$/.test(id))return load(id.slice(2));
      throw Error('Unexpected import '+id);
    }},{filename});
    return module.exports;
  }
  h.types=load('types');h.policy=load('automation-policy');h.api=load('automation');h.ig=realInstagram?load('instagram'):instagramMock;
  h.config=overrides=>h.store.set(prefix+'automation-settings',JSON.stringify({...h.policy.AUTOMATION_DEFAULTS,revision:1,enabled:true,accountId:'123',...overrides}));
  h.server=server;h.iso=iso;return h;
}
(async()=>{
  await check('validate times, lookback and KST next-day boundary',async()=>{const h=harness(),p=h.policy;assert.throws(()=>p.validateAutomationSettings({...p.AUTOMATION_DEFAULTS,publishTime:'08:00'}));assert.throws(()=>p.validateAutomationSettings({...p.AUTOMATION_DEFAULTS,maxAgeHours:'168'}));assert.equal(p.nextScheduledAt('09:00',new Date('2026-10-06T23:59:00Z')),'2026-10-07T00:00:00.000Z');assert.equal(p.nextScheduledAt('09:00',new Date('2026-10-07T00:00:00Z')),'2026-10-08T00:00:00.000Z');});
  await check('disabled scheduler observes heartbeat without generating or publishing',async()=>{const h=harness();const v=await h.api.runAutomation();assert.equal(h.renders,0);assert.equal(h.publishes,0);assert.ok(v.run.lastTickAt);});
  await check('explicit prepare renders all ten and never claims human review',async()=>{const h=harness();h.config();const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready');assert.equal(h.renders,10);assert.equal(h.publishes,0);const e=await h.server.getEdition('2026-10-07');assert.equal(e.cards.length,10);assert.ok(e.cards.every(c=>!c.verified&&c.verification==='automatic'));});
  await check('before publication time waits without overwriting already prepared edition',async()=>{const h=harness();h.now-=30*60000;h.config();await h.api.runAutomation();const before=await h.server.getEdition('2026-10-07');await h.api.runAutomation();assert.equal((await h.server.getEdition('2026-10-07')).revision,before.revision);assert.equal(h.publishes,0);});
  await check('scheduled generation publishes once and is idempotent on repeat',async()=>{const h=harness();h.config();const first=await h.api.runAutomation();assert.equal(first.run.phase,'published');assert.equal(h.publishes,1);await h.api.runAutomation();assert.equal(h.publishes,1);});
  await check('human draft preserved',async()=>{const h=harness();h.config();const old={...h.edition(),status:'draft'};h.editions.set(old.date,old);const v=await h.api.runAutomation();assert.equal(v.run.phase,'preserved');assert.deepEqual(await h.server.getEdition(old.date),old);assert.equal(h.publishes,0);});
  await check('live test waits full hour and continues while daily automation is off',async()=>{const h=harness();h.recent=h.now-59*60000;let v=await h.api.runAutomation('test');assert.equal(v.run.phase,'waiting');assert.equal(h.publishes,0);h.now+=59999;await h.api.runAutomation();assert.equal(h.publishes,0);h.now+=1;v=await h.api.runAutomation();assert.equal(h.publishes,1);assert.equal(v.run.phase,'published');});
  await check('test cancellation prevents resumed publish',async()=>{const h=harness();h.recent=h.now;await h.api.runAutomation('test');await h.api.cancelAutomationTest();h.now+=3600001;await h.api.runAutomation();assert.equal(h.publishes,0);});
  await check('cancelling during preparation cannot be overwritten by stale runner state',async()=>{const h=harness();h.onRender=async()=>h.api.cancelAutomationTest();const v=await h.api.runAutomation('test');assert.equal(h.publishes,0);assert.equal(v.run.phase,'failed');});
  await check('settings change before irreversible publish stops publication',async()=>{const h=harness();h.config();h.hook=async()=>h.config({revision:2,enabled:false});const v=await h.api.runAutomation();assert.equal(h.publishes,0);assert.equal(v.run.phase,'failed');});
  await check('stale settings revision is rejected',async()=>{const h=harness();h.config();await assert.rejects(h.api.saveAutomationSettings({...h.policy.AUTOMATION_DEFAULTS,revision:0}),/변경/);});
  await check('Instagram cooldown checks external posts before creating containers',async()=>{const h=harness(true);const e=h.edition();h.editions.set(e.date,e);h.recent=h.now-3599999;await assert.rejects(h.ig.publishEdition(e,'123'),e=>e instanceof h.ig.PublishCooldown);assert.equal(h.children,0);h.now++;const result=await h.ig.publishEdition(e,'123');assert.equal(result.status,'published');assert.equal(h.publishes,1);});
  await check('unknown recent-media response fails closed',async()=>{const h=harness(true);h.malformed=true;const e=h.edition();await assert.rejects(h.ig.publishEdition(e,'123'),/게시 시각/);assert.equal(h.publishes,0);});
  await check('ambiguous final POST is never resent and blocks another edition',async()=>{const h=harness(true);const e=h.edition();h.editions.set(e.date,e);h.ambiguous=true;let result=await h.ig.publishEdition(e,'123');assert.equal(result.status,'needs_check');assert.ok(result.publication.publishRequestedAt);assert.equal(h.publishes,1);h.now+=60001;result=await h.ig.reconcileEdition(result);assert.equal(h.publishes,1);const next=h.edition('2026-10-08');h.editions.set(next.date,next);await assert.rejects(h.ig.publishEdition(next,'123'),/이전 발행 결과/);assert.equal(h.publishes,1);});
  await check('published remote container only reconciles, never reposts',async()=>{const h=harness(true);const e={...h.edition(),status:'needs_check',publication:{attempt:'existing',children:[],accountId:'123',containerId:'456',publishRequestedAt:new Date(h.now-120000).toISOString()},updatedAt:new Date(h.now-120000).toISOString()};h.editions.set(e.date,e);h.remoteStatus='PUBLISHED';const result=await h.ig.reconcileEdition(e);assert.equal(result.status,'published');assert.equal(h.publishes,0);});
  await check('confirmed auth rejection clears its fence and allows a new attempt',async()=>{const h=harness(true);const e=h.edition();h.editions.set(e.date,e);h.authRejected=true;let result=await h.ig.publishEdition(e,'123');assert.equal(result.status,'approved');assert.equal(result.publication.publishRequestedAt,undefined);h.authRejected=false;result=await h.ig.publishEdition(result,'123');assert.equal(result.status,'published');assert.equal(h.publishes,2);});
  await check('earlier saved publication time replaces old waiting deadline',async()=>{const h=harness();h.now-=30*60000;h.config();await h.api.runAutomation();h.config({revision:2,publishTime:'08:35'});h.now+=6*60000;const v=await h.api.runAutomation();assert.equal(v.run.phase,'published');assert.equal(h.publishes,1);});
  await check('narrower lookback regenerates outdated automatic cards',async()=>{const h=harness();h.config({revision:2,maxAgeHours:72});const old=h.edition();old.automation={preparedAt:h.iso(),settingsRevision:1};old.cards=old.cards.map(c=>({...c,publishedAt:new Date(h.now-4*86400000).toISOString()}));old.windowStart=new Date(h.now-7*86400000).toISOString();h.editions.set(old.date,old);const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready');assert.equal(h.renders,10);assert.ok((await h.server.getEdition(old.date)).cards.every(c=>Date.parse(c.publishedAt)>h.now-72*3600000));});
  await check('caption-only human draft is preserved',async()=>{const h=harness();h.config();const old={...h.edition(),status:'draft',cards:[],caption:'직접 작성한 설명'};h.editions.set(old.date,old);const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'preserved');assert.deepEqual(await h.server.getEdition(old.date),old);});
  await check('prepare-only retains pending publication state',async()=>{const h=harness();h.config();const old={...h.edition(),status:'needs_check'};h.editions.set(old.date,old);const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'waiting');assert.equal(h.publishes,0);assert.equal(h.renders,0);});
  await check('older unresolved final request prevents new automatic edition',async()=>{const h=harness();h.config();const old={...h.edition('2026-10-06'),status:'needs_check',publication:{attempt:'old',children:[],publishRequestedAt:h.iso()}};h.editions.set(old.date,old);const v=await h.api.runAutomation();assert.equal(v.run.phase,'failed');assert.match(v.run.message,/2026-10-06/);assert.equal(h.publishes,0);});
  await check('recovered completed fence supplies a conservative cooldown',async()=>{const h=harness(true);const old={...h.edition('2026-10-06'),status:'published',publishedAt:new Date(h.now-60000).toISOString(),publication:{attempt:'old',children:[],accountId:'123'}};h.editions.set(old.date,old);h.store.set('cardnews:{admin}:publish-fence:123',JSON.stringify({date:old.date,attempt:'old',requestedAt:new Date(h.now-65000).toISOString()}));const next=h.edition();h.editions.set(next.date,next);await assert.rejects(h.ig.publishEdition(next,'123'),e=>e instanceof h.ig.PublishCooldown);assert.equal(h.publishes,0);});
  await check('exactly ten news cards never load supplemental content',async()=>{const h=harness();const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready');assert.equal(h.supplementCalls,0);});
  await check('shortfall uses a dated Explore card and an undated glossary card',async()=>{const h=harness();h.candidates=h.edition().candidates.slice(0,8);h.supplements=[{id:'glossary:embedding',title:'임베딩 개념',summary:'의미를 숫자로 표현하는 방식이다.',sourceName:'용어사전',sourceUrl:'https://example.org/glossary#embedding',publishedAt:'',datePrecision:'none',origin:'glossary'},{id:'explore:review',title:'실행 승인 도구',summary:'실행 요청을 검토하는 도구이다.',sourceName:'Explore',sourceUrl:'https://example.org/explore/review',publishedAt:'2026-10-07',datePrecision:'day',origin:'explore'}];const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready',v.run.message);const e=await h.server.getEdition('2026-10-07');assert.equal(e.cards.length,10);assert.equal(e.automation.supplementCount,2);assert.equal(e.cards[8].publishedAt,'');assert.equal(e.cards[9].publishedAt,'2026-10-07');assert.equal(h.renders,10);h.recent=h.now-3600001;const posted=await h.api.runAutomation('test');assert.equal(posted.run.phase,'published',posted.run.message);assert.equal(h.publishes,1);});
  await check('content published more than sixty editions ago is not reused',async()=>{const h=harness();h.candidates=h.edition().candidates.slice(0,9);const term=(id,title)=>({id:'glossary:'+id,title,summary:'내용을 확인하고 활용하는 방법이다.',sourceName:'용어사전',sourceUrl:'https://example.org/glossary#'+id,publishedAt:'',datePrecision:'none',origin:'glossary'});h.supplements=[term('old','예전 용어 정리'),term('new','새 용어 정리')];const old=h.edition('2026-01-01');old.status='published';old.cards=[{...old.cards[0],candidateId:'glossary:old',sourceUrl:'https://old.example.org/glossary#old'}];h.editions.set(old.date,old);for(let i=1;i<=70;i++){const date=new Date(Date.parse('2026-01-01')+i*86400000).toISOString().slice(0,10);h.editions.set(date,{...h.edition(date),status:'published',cards:[]});}const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready',v.run.message);const cards=(await h.server.getEdition('2026-10-07')).cards;assert.equal(cards.at(-1).candidateId,'glossary:new');});
  await check('restored day-only content uses KST for the retained date range',async()=>{const h=harness(),old=h.edition();const candidate={id:'explore:old',title:'도구 이해',summary:'도구의 작동 방식을 설명했다.',sourceName:'Explore',sourceUrl:'https://example.org/explore/old',publishedAt:'2026-10-01',datePrecision:'day',origin:'explore'};old.cards=[{candidateId:candidate.id,title:candidate.title,body:candidate.summary,sourceName:candidate.sourceName,sourceUrl:candidate.sourceUrl,publishedAt:candidate.publishedAt,verified:true}];old.candidates=[candidate];const fresh={...h.edition(),windowStart:'2026-10-06T00:00:00Z',cards:[],candidates:[]};const restored=h.types.preserveDraft(fresh,old);assert.equal(restored.windowStart,'2026-09-30T15:00:00.000Z');assert.equal(h.types.cardDateIssue(restored.cards[0],restored),'');});
  await check('cached automatic cards are regenerated after publication elsewhere',async()=>{const h=harness();await h.api.runAutomation('prepare');const old=await h.server.getEdition('2026-10-07');const previous={...h.edition('2026-10-06'),status:'published',cards:[old.cards[0]]};h.editions.set(previous.date,previous);h.supplements=[{id:'glossary:embedding',title:'임베딩 개념',summary:'의미를 숫자로 표현하는 방식이다.',sourceName:'용어사전',sourceUrl:'https://example.org/glossary#embedding',publishedAt:'',datePrecision:'none',origin:'glossary'}];const v=await h.api.runAutomation('prepare');assert.equal(v.run.phase,'ready',v.run.message);const next=await h.server.getEdition('2026-10-07');assert.ok(next.revision>old.revision);assert.ok(!next.cards.some(c=>c.candidateId===old.cards[0].candidateId));assert.equal(next.automation.supplementCount,1);});
  await check('a publication arriving after preparation blocks the final automatic request',async()=>{const h=harness();await h.api.runAutomation('prepare');const old=await h.server.getEdition('2026-10-07');h.hook=async()=>{h.editions.set('2026-10-06',{...h.edition('2026-10-06'),status:'published',cards:[old.cards[0]]});};const v=await h.api.runAutomation('test');assert.equal(v.run.phase,'failed');assert.match(v.run.message,/다른 판본에서 이미/);assert.equal(h.publishes,0);});
  console.log(JSON.stringify({passed:true,checks,externalRequests:0}));
})().catch(error=>{console.error(error);process.exitCode=1;});
