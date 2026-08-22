
// /api/analyze.js — v3.6 FINAL FIXED - robust payload handling
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const channels = body.channels || body || [];
  if (!Array.isArray(channels) || channels.length === 0) {
    return res.status(400).json({ error: '채널 데이터가 비어있습니다.' });
  }

  // payload 정규화 — 프론트에서 어떤 키로 와도 받아줌
  const normalized = channels.map((c,i) => {
    const title = c.채널 || c.title || c.채널명 || c.channel || `채널${i+1}`;
    const subs = c.구독자 || c.subs || c.현재구독자 || 0;
    const avgViews = c.최근평균조회 || c.avgViews || c.avg_views || 0;
    const eff = c.구독자대비배수 || c.effVsSub || c.eff || null;
    const recentTitles = c.최근제목 || c.recentTitles || c.최근제목들 || c.titles || [];
    const durations = c.최근영상길이초 || c.durations || [];
    const totalViews = c.총조회 || c.totalViews || 0;
    const vidCount = c.총영상 || c.vidCount || 0;
    return { title, subs, avgViews, eff, recentTitles: recentTitles.slice(0,15), durations: durations.slice(0,15), totalViews, vidCount };
  });

  const prompt = `
당신은 유튜브 성장 분석가다. 아래 채널 벤치마크 데이터를 보고, 왜 1등 채널이 떡상했는지 한국어로 3~4문장으로 명시적으로 분석해라.

규칙:
- 구독자수, 최근 평균 조회수, 구독자 대비 배수, 최근 제목 패턴, 영상 길이 패턴을 근거로 말해라.
- 제목에서 반복되는 키워드, 포맷(예: '가지', '인생', '숏츠')을 집어라.
- 추측하지 말고 데이터에 있는 것만 말해라.
- 마지막에 이 채널을 따라하려면 어떤 제목/포맷을 써야 하는지 한 문장 팁.
- JSON 요청 같은 말 하지 마라. 데이터가 부족해도 있는 데이터로 최선을 다해 분석해라.

데이터:
${JSON.stringify(normalized, null, 2)}
`;

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await anthropicRes.json();
    if (!anthropicRes.ok) {
      return res.status(anthropicRes.status).json({ error: data.error?.message || 'Anthropic API 오류' });
    }
    const text = data.content?.[0]?.text || '분석 실패';
    return res.status(200).json({ analysis: text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
