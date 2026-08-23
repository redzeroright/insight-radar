
// /api/analyze.js — v3.8.1 FINAL — Claude 4.5 Haiku Fixed + Anti-Hallucination + Cost Optimized
// Title: Insight Radar v3.8.1 FINAL - Claude 4.5 Haiku | 2026-05-16
export const config = { runtime: 'edge' };
const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 700;
const TIMEOUT_MS = 9000;

export default async function handler(req) {
  if (req.method !== 'POST') return new Response(JSON.stringify({error:'POST only'}),{status:405,headers:{'content-type':'application/json'}});
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({error:'서버 설정 오류'}),{status:500,headers:{'content-type':'application/json'}});

  let body;
  try{ body = await req.json(); }catch{ return new Response(JSON.stringify({error:'잘못된 요청'}),{status:400,headers:{'content-type':'application/json'}}); }
  const channels = body.channels || [];
  if (!Array.isArray(channels) || channels.length===0) return new Response(JSON.stringify({error:'채널 데이터 없음'}),{status:400,headers:{'content-type':'application/json'}});

  // Sanitize + take 20 recents with views — economical
  const normalized = channels.slice(0,6).map((c,i)=>({
    title: String(c.title||`채널${i+1}`).slice(0,60).replace(/[<>]/g,''),
    subs: Number(c.subs||0),
    totalViews: Number(c.totalViews||0),
    avgViews: Number(c.avgViews||0),
    perVideoAvg: Number(c.perVideoAvg||0),
    eff: c.effVsSub ?? c.eff ?? null,
    publishedAt: c.publishedAt ? String(c.publishedAt).slice(0,10) : null,
    cadence: c.cadence ? String(c.cadence).slice(0,30) : null,
    recent: (c.recent||c.recentTitles||[]).slice(0,20).map(r=>{
      if(typeof r==='string') return {t:r.slice(0,100), views:0};
      return {t:String(r.t||r.title||r).slice(0,100).replace(/[<>]/g,''), views:Number(r.views||0)};
    })
  }));

  // Anti-hallucination prompt
  const prompt = `You are YouTube analyst for Insight Radar v3.8.1 FINAL.

STRICT RULES:
- Analyze ONLY inside ### DATA ###. Never invent celebrity names, events, topics not in titles.
- If titles are mostly "shorts" or repetitive, say "쇼츠 포맷 반복" — do NOT hallucinate "지드래곤, 빅뱅" etc.
- Compare eff (구독자 대비 조회배수) to determine efficiency winner.
- Output: Korean, 4 sentences max.
  Sentence1: Who is efficiency winner (subs, eff, recent avg).
  Sentence2: Winner's title pattern (repeat keyword, count).
  Sentence3: Loser's weakness (lower eff, cadence).
  Sentence4: Tip starting with "팁:" (actionable, specific to winner's format).
- No markdown **, no JSON, no extra.

### DATA ###
${JSON.stringify(normalized, null, 2)}
### DATA END ###
`;

  const controller = new AbortController();
  const to = setTimeout(()=>controller.abort(), TIMEOUT_MS);
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2023-06-01'},
      signal:controller.signal,
      body:JSON.stringify({model:MODEL, max_tokens:MAX_TOKENS, temperature:0.15, messages:[{role:'user', content:prompt}]})
    });
    clearTimeout(to);
    const data = await r.json();
    if(!r.ok){
      console.error('Anthropic error', r.status, JSON.stringify(data).slice(0,600));
      return new Response(JSON.stringify({error:'AI 분석을 일시적으로 사용할 수 없습니다. 잠시 후 다시 시도해주세요.'}),{status:502,headers:{'content-type':'application/json'}});
    }
    let analysis = data.content?.[0]?.text?.trim() || '';
    // post-process: remove hallucinated celebrity lists if titles don't contain them
    const allTitles = normalized.flatMap(c=>c.recent.map(x=>x.t)).join(' ').toLowerCase();
    const banned = ['지드래곤','빅뱅','태양','블랙핑크','bts','아이유'];
    if(!banned.some(b=>allTitles.includes(b.toLowerCase()))){
      banned.forEach(b=>{
        const re = new RegExp(b,'gi');
        analysis = analysis.replace(re,'');
      });
    }
    return new Response(JSON.stringify({analysis, model:'v3.8.1 FINAL / haiku-4.5', version:'v3.8.1 FINAL'}),{status:200,headers:{'content-type':'application/json','Cache-Control':'no-store'}});
  }catch(e){
    clearTimeout(to);
    console.error('fetch err', e.message);
    return new Response(JSON.stringify({error:'AI 분석을 일시적으로 사용할 수 없습니다.'}),{status:502,headers:{'content-type':'application/json'}});
  }
}
