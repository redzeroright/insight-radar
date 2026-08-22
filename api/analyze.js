
// /api/analyze.js — v3.6 SONNET+OPUS FALLBACK — tries every model until one works
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
    const subs = c.구독자 || c.subs || c.현재구독자 || 0;
    const avgViews = c.최근평균조회 || c.avgViews || 0;
    const eff = c.구독자대비배수 || c.effVsSub || null;
    const recentTitles = c.최근제목 || c.recentTitles || [];
    const totalViews = c.총조회 || c.totalViews || 0;
    return { title, subs, avgViews, eff, recentTitles: recentTitles.slice(0,12), totalViews };
  });

  const prompt = `당신은 유튜브 성장 분석가다. 아래 벤치마크를 보고 1등 채널이 왜 떡상했는지 한국어로 3~4문장으로 분석해라. 제목 반복 키워드, 포맷, 길이 패턴을 근거로 말하고 마지막에 따라하려면 뭘 해야 하는지 팁 한 문장.

데이터: ${JSON.stringify(normalized, null, 2)}`;

  const models = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229',
    'claude-3-5-sonnet-latest',
    'claude-3-haiku-latest'
  ];

  let lastErr = '';
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
        const text = data.content?.[0]?.text || '분석 실패';
        return res.status(200).json({ analysis: text, modelUsed: model });
      } else {
        lastErr = `model ${model} -> ${JSON.stringify(data)}`;
        // if not model-not-found, return immediately
        if (!JSON.stringify(data).toLowerCase().includes('model')) {
          return res.status(r.status).json({ error: data.error?.message || lastErr });
        }
        // otherwise try next model
        continue;
      }
    } catch (e) {
      lastErr = e.message;
      continue;
    }
  }
  return res.status(404).json({ error: `모든 모델 시도 실패. 마지막 오류: ${lastErr}` });
}
