
// /api/analyze.js — v3.6 CLAUDE 4.5 FINAL — 2026 validated models
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const channels = body.channels || body || [];
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({ error: '채널 데이터가 비어있습니다.' });
  }

  const normalized = channels.map((c,i) => {
    const title = c.채널 || c.title || c.채널명 || c.channel || `채널${i+1}`;
    const subs = c.구독자 || c.subs || 0;
    const avgViews = c.최근평균조회 || c.avgViews || 0;
    const eff = c.구독자대비배수 || c.effVsSub || null;
    const recentTitles = c.최근제목 || c.recentTitles || [];
    return { title, subs, avgViews, eff, recentTitles: recentTitles.slice(0,12) };
  });

  const prompt = `유튜브 성장 분석가로, 아래 벤치마크에서 1등 채널이 왜 효율 1등인지 한국어로 3~4문장 분석. 제목 반복 키워드/포맷/길이를 근거로, 마지막에 따라할 팁 1문장. 데이터가 부족해도 추론해서 분석해라. JSON 요구 금지.

데이터: ${JSON.stringify(normalized, null, 2)}`;

  // 2026 현재 Anthropic에서 404 안 나는 모델만. 3.5는 전부 404됨 (검색결과 확인)
  const models = [
    'claude-haiku-4-5-20251001',
    'claude-haiku-4-5',
    'claude-sonnet-4-5-20250929',
    'claude-sonnet-4-5',
    'claude-sonnet-4-20250514',
    'claude-3-7-sonnet-20250219'
  ];

  let last = '';
  for (const model of models) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 800,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const data = await r.json();
      if (r.ok) {
        return res.status(200).json({ analysis: data.content?.[0]?.text || '', modelUsed: model });
      }
      last = `${model}: ${JSON.stringify(data).slice(0,400)}`;
      if (!String(data.error?.message||'').toLowerCase().includes('model') && r.status !== 404) {
        return res.status(r.status).json({ error: data.error?.message || last });
      }
    } catch (e) {
      last = `${model}: ${e.message}`;
    }
  }
  return res.status(500).json({ error: `모든 모델 실패: ${last}` });
}
