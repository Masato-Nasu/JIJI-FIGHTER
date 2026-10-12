// JIJI FIGHTER — free public LIVE TREND feed for Cloudflare Pages Functions.
// Requires no API keys, credentials or paid X API subscription.
// Sources: Google Trends Japan RSS, public Bluesky unspecced trends API.
// The two providers use DIFFERENT ranking methodologies: this game's combined
// ranks are an interleaving, not a unified measure of worldwide popularity.
const GOOGLE='https://trends.google.com/trending/rss?geo=JP';
const BLUESKY='https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrends?limit=25';
const BSKY_ALTERNATE='https://public.api.bsky.app/xrpc/app.bsky.unspecced.getTrendingTopics?limit=25';
const MAX_PERSON_SHARE=.10;
const GOOGLE_NEWS='https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja';
const YAHOO_NEWS='https://news.yahoo.co.jp/rss/topics/top-picks.xml';
// Additional real, recent Japanese news RSS feeds (not sample words).
const NEWS_QUERIES=['テクノロジー','経済','天気 災害','アニメ ゲーム','スポーツ','科学 宇宙'];
const ADDITIONAL_NEWS=NEWS_QUERIES.map(q=>'https://news.google.com/rss/search?'+new URLSearchParams({q,hl:'ja',gl:'JP',ceid:'JP:ja'}));
// Only terms extracted from current, real feed records. Never generated filler.
const NEWS_STOP=new Set(['日本','世界','国内','海外','今年','昨年','今日','明日','昨日','一方','理由','状況','速報','最新','現在','話題','場合','今後','今回','問題','影響','関連','注目','発表','確認','対応','説明','会見','関係','調査','可能','対象','情報','写真','映像','動画','記事','報道','速報版','全文','更新','詳細','発生','初日','初回','結果','当時','連続','特集','番組表']);
// Safety-first: ambiguous Wikipedia article titles are frequently people.
const SUBJECT_END=/(地震|震度|台風|暴風|警報|速報|選挙|国会|政府|法案|法律|事件|事故|災害|豪雨|猛暑|大雪|洪水|噴火|気象|天気|物価|株価|相場|経済|市場|為替|銀行|科学|研究|量子|宇宙|衛星|探査|技術|発明|電池|半導体|通信|人工知能|生成AI|鉄道|新幹線|電車|航空|空港|交通|自動車|鉄道|旅客|観光|温泉|花火|祭典|美術|展示|博物館|考古|建築|設計|機械|環境|気候|生物|動物|植物|感染症|医療|健康|教育|試験|大会|決勝|優勝|野球|野球場|競技|サッカー|五輪|映画|音楽|演奏|公演|放送|番組|ドラマ|アニメ|漫画|小説|文学|作品|ゲーム|発売|新作|新型|製品|商品|公開|配信|開幕|決定|開発|発表|調査|予報|運休|遅延|停電|復旧|規制|価格|金利|買収|破産|倒産|感染|結婚式|地価|住宅|世界遺産|文化財|台風情報|深海|月面|火星)/;
const PERSON_END=/(さん|氏|容疑者|被告|議員|首相|総理|大統領|監督|俳優|女優|歌手|選手|教授|社長|会長|騎手|王子|王女|声優|知事|市長|アナウンサー)$/;
function clearTopic(word){return SUBJECT_END.test(word)&&!PERSON_END.test(word);}
const TOPIC_HINT=/(地震|台風|天気|地理|経済|事件|災害|事故|選挙|戦争|政策|法律|政府|政党|大臣|鉄道|新幹線|電車|バス|飛行機|空港|国際|天文|宇宙|科学|技術|情報|通信|株式|市場|銀行|世界|教育|大学|学校|選手権|競技|大会|映画|劇場|漫画|アニメ|放送|番組|ドラマ|作品|音楽|曲|ゲーム|小説|新聞|雑誌|施設|企業|会社|都市|県|市|区|町|村|地方|国|天皇|住宅|機械|人工|電子|写真|文化|歴史|博物館|観光|動物|植物|感染|医療|研究|物理|数学|交通|機関|運動|商品|自動車|駅|島|山|川|海|橋|城|地名|建築|試験|祭り|火山|温泉|決勝|優勝|危機|物価|輸送|貨物|花火|衛星)/;
const TTL=600;  // 15 minutes (edge cache, subject to host policy)
let pending=null;
const json=(body,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':status===200?`public, max-age=60, s-maxage=${TTL}`:'no-store',
    'X-Content-Type-Options':'nosniff'}});
function textClean(raw){
  const s=String(raw||'').normalize('NFKC').replace(/^#+/,'').replace(/[\s\u3000]+/g,'').trim();
  const length=Array.from(s).length;
  // Kana and mixed-script real topics are valid. Restrict characters to those
  // the packaged Japanese glyph atlas can reliably render.
  if(length<2||length>8||!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s)||
    /[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー0-9A-Za-z]/u.test(s))return '';
  if(/^[\p{Script=Hiragana}]{2,3}$/u.test(s) && COMMON_KANA.has(s))return '';
  if(NEWS_STOP.has(s))return '';
  return s;
}
const COMMON_KANA=new Set(['これ','それ','あれ','ここ','そこ','どこ','ため','もの','こと','など','から','まで','には','では','でも','より','だけ','そして','として','まま','その','この','あの','いる','ある','ない','です','ます','する','した','され','れる','ました','だった','ながら','ところ','みんな','さらに','とき','きょう','きのう','あす','よう','どんな','なんと','はず']);
function unescapeXml(s){
  return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&#(x[0-9a-f]+|\d+);|&(amp|lt|gt|quot|apos);/gi,(whole,code,entity)=>{
    if(entity)return {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[entity.toLowerCase()]||whole;
    const n=code[0].toLowerCase()==='x'?parseInt(code.slice(1),16):parseInt(code,10);
    return n>0&&n<=0x10ffff?String.fromCodePoint(n):whole;
  });
}
export function parseGoogleRss(xml){
  const blocks=String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
  const out=[],seen=new Set();
  for(const block of blocks){
    const match=block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if(!match)continue;
    const word=textClean(unescapeXml(match[1]).replace(/<[^>]*>/g,''));
    if(!word||seen.has(word))continue;
    seen.add(word);out.push(word);
    if(out.length===120)break;
  }
  return out;
}
export function parseBluesky(payload){
  const raw=Array.isArray(payload?.trends)?payload.trends:Array.isArray(payload?.topics)?payload.topics:[];
  const out=[],seen=new Set();
  for(const item of raw){
    const word=textClean(item?.displayName||item?.topic);
    if(!word||seen.has(word))continue;
    seen.add(word);out.push(word);
    if(out.length===25)break;
  }
  return out;
}
export function parseWikipedia(payload){
  const raw=Array.isArray(payload?.items?.[0]?.articles)?payload.items[0].articles:[];
  const out=[],seen=new Set();
  for(const article of raw){
    const title=String(article?.article||'').replace(/_/g,' ');
    if(/^(Special:|特別:|メインページ|Wikipedia:|Template:|ファイル:|カテゴリ:)/i.test(title))continue;
    const word=textClean(title);
    if(!word||seen.has(word))continue;
    seen.add(word);out.push(word);
    if(out.length>=250)break;
  }
  return out;
}
// RSS headline fragments are real, recently published Japanese news vocabulary.
// They are not Google search trend ranks; the result advertises its news source.
export function parseHeadlineRss(xml,now=Date.now()){
  const blocks=String(xml).match(/<item\b[^>]*>[\s\S]*?<\/item>/gi)||[];
  const scored=new Map();let count=0;
  const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('ja',{granularity:'word'}):null;
  for(const block of blocks.slice(0,250)){
    const titleTag=block.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    if(!titleTag)continue;
    const dateTag=block.match(/<pubDate\b[^>]*>([^<]+)<\/pubDate>/i);
    if(dateTag){
      const timestamp=Date.parse(dateTag[1]);
      if(Number.isFinite(timestamp)&&(timestamp>now+120000||timestamp<now-72*3600000))continue;
    }
    let headline=unescapeXml(titleTag[1]).replace(/<[^>]+>/g,'');
    headline=headline.split(/\s+[-–—]\s+/)[0];
    // Character chunks preserve compounds, word segmentation admits hiragana
    // and katakana without creating arbitrary fake words.
    const chunks=headline.match(/[\p{Script=Han}]{2,8}/gu)||[];
    const tokens=segmenter?[...segmenter.segment(headline)].filter(e=>e.isWordLike).map(e=>e.segment):[];
    for(const raw of [...chunks,...tokens]){
      const word=textClean(raw);
      if(!word)continue;
      scored.set(word,(scored.get(word)||0)+1);
    }
    count++;
  }
  return {words:[...scored].sort((a,b)=>b[1]-a[1]).map(x=>x[0]).slice(0,420),headlines:count};
}
async function newsRss(url,source){
  const response=await fetch(url,{headers:{Accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(8500)});
  if(!response.ok)throw new Error(source+' HTTP '+response.status);
  const content=await response.text();
  if(content.length>1_400_000)throw new Error(source+' RSS oversized');
  return parseHeadlineRss(content);
}
// Entity classification is used only to keep person names from overwhelming gameplay.
// Wikidata P31=Q5 is a reliable 'human' signal; if lookup fails we conservatively
// admit Wikipedia titles with clear subject keywords rather than assuming names are topics.
async function findPeople(words){
  const people=new Set(),known=new Set(),nonpeople=new Set();
  const uniq=[...new Set(words)].slice(0,240);
  const chunks=[];for(let i=0;i<uniq.length;i+=35)chunks.push(uniq.slice(i,i+35));
  await Promise.all(chunks.map(async chunk=>{
    try{
      const query=new URLSearchParams({action:'wbgetentities',sites:'jawiki',titles:chunk.join('|'),props:'claims|sitelinks',sitefilter:'jawiki',format:'json'});
      const response=await fetch('https://www.wikidata.org/w/api.php?'+query.toString(),{
        headers:{Accept:'application/json'},signal:AbortSignal.timeout(5500)});
      if(!response.ok)return;
      const body=await response.json();
      for(const entity of Object.values(body.entities||{})){
        const title=entity?.sitelinks?.jawiki?.title;
        if(!title)continue;
        const word=textClean(title);
        if(!word)continue;
        known.add(word);
        const types=(entity.claims?.P31||[]).map(c=>c.mainsnak?.datavalue?.value?.id);
        if(types.some(type=>['Q5','Q15632617','Q95074'].includes(type)))people.add(word);
        else if(types.some(type=>type&&type!=='Q4167410'&&type!=='Q4167836'))nonpeople.add(word);
      }
    }catch(_){/* optional classification failed, keep topic-only fallback */}
  }));
  return {people,known,nonpeople};
}
async function wikipedia(){
  // Wikimedia daily pageview totals lag by ~1–3 days. Never present them as live trends.
  const day=new Date(Date.now()-3*86400000);
  const date=[day.getUTCFullYear(),String(day.getUTCMonth()+1).padStart(2,'0'),String(day.getUTCDate()).padStart(2,'0')].join('/');
  const url=`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/ja.wikipedia/all-access/${date}`;
  const res=await fetch(url,{headers:{Accept:'application/json','User-Agent':'JIJIFighter/0.9.11 (https://jiji-fighter.pages.dev/; public game)'},signal:AbortSignal.timeout(9500)});
  if(!res.ok)throw new Error('Wikipedia HTTP '+res.status);
  return {words:parseWikipedia(await res.json()),date};
}
async function fetchJson(url){
  const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7500)});
  if(!res.ok)throw new Error('Bluesky HTTP '+res.status);
  return res.json();
}
async function google(){
  const res=await fetch(GOOGLE,{headers:{Accept:'application/rss+xml, application/xml, text/xml'},signal:AbortSignal.timeout(7500)});
  if(!res.ok)throw new Error('Google HTTP '+res.status);
  const raw=await res.text();
  if(raw.length>1_000_000)throw new Error('Google RSS oversized');
  return parseGoogleRss(raw);
}
async function bluesky(){
  const main=await fetchJson(BLUESKY);
  let words=parseBluesky(main);
  if(!words.length)words=parseBluesky(await fetchJson(BSKY_ALTERNATE));
  return words;
}
export function mixFeeds(g,b,news=[],yahoo=[],personSet=new Set(),knownSet=new Set(),nonpersonSet=new Set(),additional=[]){
  const options=[],seen=new Set(),counts={google:0,bluesky:0,googleNews:0,yahooNews:0,newsExtra:0};
  const offer=(raw,source)=>{
    const word=textClean(raw);
    if(!word||seen.has(word))return;
    seen.add(word);
    const person=personSet.has(word)||PERSON_END.test(word);
    const concept=nonpersonSet.has(word)||clearTopic(word)||TOPIC_HINT.test(word);
    // Unclassified 2–4 all-kanji strings may be names; cap those without
    // punishing hiragana / katakana or event/technology terms.
    const suspicious=!concept && /^[\p{Script=Han}]{2,4}$/u.test(word) && !knownSet.has(word);
    options.push({text:word,source,classification:person?'person':suspicious?'ambiguous':'topic'});
  };
  const streams=[[g,'google'],[b,'bluesky'],[news,'google-news'],[yahoo,'yahoo-news'],[additional,'news-extra']];
  const max=Math.max(...streams.map(([items])=>items.length));
  for(let i=0;i<max;i++)for(const [items,source] of streams)if(i<items.length)offer(items[i],source);
  // Choose known topics first; allocate at most 10% of final entries to
  // known/possible person names. Do not let uncertainty reduce all LIVE data to 3.
  const topics=options.filter(x=>x.classification==='topic');
  const uncertain=options.filter(x=>x.classification!=='topic');
  const limit=Math.min(35,Math.floor(topics.length/9));
  const allowed=new Set(uncertain.slice(0,limit).map(x=>x.text));
  const result=[];let person_count=0,unclassified_count=0;
  for(const x of options){
    if(result.length>=350)break;
    if(x.classification!=='topic'&&!allowed.has(x.text))continue;
    if(x.classification==='person')person_count++;
    if(x.classification==='ambiguous')unclassified_count++;
    result.push({text:x.text,rank:result.length+1,source:x.source});
    counts[x.source==='google-news'?'googleNews':x.source==='yahoo-news'?'yahooNews':x.source==='news-extra'?'newsExtra':x.source]++;
  }
  return {items:result,counts,person_count,unclassified_count,person_limit:limit,
    candidate_count:options.length,filtered_count:options.length-result.length};
}

async function buildFeed(){
  const tasks=[google(),bluesky(),newsRss(GOOGLE_NEWS,'Google News'),newsRss(YAHOO_NEWS,'Yahoo News'),
    ...ADDITIONAL_NEWS.map((url,i)=>newsRss(url,'Google News '+NEWS_QUERIES[i]))];
  const settled=await Promise.allSettled(tasks);
  const from=i=>settled[i].status==='fulfilled'?settled[i].value:null;
  const g=from(0)||[],b=from(1)||[],gn=from(2)||{words:[],headlines:0},yn=from(3)||{words:[],headlines:0};
  const extras=settled.slice(4).filter(e=>e.status==='fulfilled').map(e=>e.value);
  const extraWords=[...new Set(extras.flatMap(e=>e.words))];
  const metadata=await findPeople([...g,...b,...gn.words,...yn.words,...extraWords]);
  let combined=mixFeeds(g,b,gn.words,yn.words,metadata.people,metadata.known,metadata.nonpeople,extraWords);
  // If every live RSS/social provider fails, use actual (dated) Japanese
  // Wikipedia page-view rankings rather than pretending samples are live.
  let wikipediaFallback=null;
  if(!combined.items.length){
    try{
      const wiki=await wikipedia();
      const topics=wiki.words.filter(word=>clearTopic(word)||TOPIC_HINT.test(word));
      const fallbackWords=topics.length?topics:wiki.words.filter(word=>!PERSON_END.test(word)&&!(/^[\\p{Script=Han}]{2,4}$/u.test(word)));
      if(fallbackWords.length){
        wikipediaFallback={ok:true,date:wiki.date,count:Math.min(fallbackWords.length,150),source:'dated-pageviews-not-live-trends'};
        combined={...combined,items:fallbackWords.slice(0,150).map((text,i)=>({text,rank:i+1,source:'wikipedia-pageviews'}))};
      }
    }catch(error){wikipediaFallback={ok:false,error:String(error?.message||error)};}
  }
  const sources={
    wikipediaFallback,
    google:{ok:!!from(0),count:combined.counts.google,raw:g.length},
    bluesky:{ok:!!from(1),count:combined.counts.bluesky,raw:b.length},
    googleNews:{ok:!!from(2),count:combined.counts.googleNews,raw:gn.words.length,headlines:gn.headlines},
    yahooNews:{ok:!!from(3),count:combined.counts.yahooNews,raw:yn.words.length,headlines:yn.headlines},
    newsExtra:{ok:extras.length>0,count:combined.counts.newsExtra,raw:extraWords.length,
      feeds_ok:extras.length,feeds_total:NEWS_QUERIES.length,headlines:extras.reduce((n,e)=>n+e.headlines,0)}
  };
  const failed=settled.map((r,i)=>r.status==='rejected'?{provider:i<4?['google','bluesky','googleNews','yahooNews'][i]:NEWS_QUERIES[i-4],error:String(r.reason?.message||'error')}:null).filter(Boolean);
  if(!combined.items.length)return json({error:'NO_LIVE_WORDS',sources,failed,live_count:0,sample_count:0},503);
  return json({source:'public-trends',region:wikipediaFallback?.ok?'Japanese Wikipedia historical pageviews (not live)': 'Google Trends Japan; Bluesky public/global; Japanese published news RSS',
    updated_at:new Date().toISOString(),rank_method:wikipediaFallback?.ok?'Historical Japanese Wikipedia pageviews, not live trending terms':'Game-order of real RSS search terms, SNS topics and recent headline terms; NOT a unified popularity ranking',
    sources,failed,person_count:combined.person_count,unclassified_count:combined.unclassified_count,
    person_limit:combined.person_limit,candidate_count:combined.candidate_count,filtered_count:combined.filtered_count,
    live_count:combined.items.length,sample_count:0,items:combined.items});
}

export async function onRequestGet({request,waitUntil}){
  const url=new URL(request.url);
  const key=new Request(`${url.origin}/api/trends?edition=live-with-wikipedia-fallback-v2`,{method:'GET'});
  const cache=typeof caches!=='undefined'&&caches.default?caches.default:null;
  if(cache){try{const hit=await cache.match(key);if(hit)return hit;}catch(_){/* cache unavailable */}}
  if(!pending)pending=buildFeed().finally(()=>pending=null);
  const response=await pending;
  if(response.ok&&cache){const task=cache.put(key,response.clone());if(typeof waitUntil==='function')waitUntil(task);else await task;}
  return response;
}
