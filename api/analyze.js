// api/analyze.js — Vercel 서버리스 함수
// 브라우저는 채널 데이터만 보내고, API 키는 이 서버(환경변수)에만 존재합니다.
// 배포 방법:
//   1) 이 파일을 GitHub 저장소의 "api/analyze.js" 경로에 둡니다 (index.html 과 같은 저장소).
//   2) Vercel 대시보드 → Settings → Environment Variables 에 ANTHROPIC_API_KEY 를 추가합니다.
//   3) 재배포하면 프론트의 fetch('/api/analyze') 가 이 함수를 호출합니다.

const MODEL = 'claude-haiku-4-5'; // 항상 사용 가능한 저비용 Haiku 별칭(최신 스냅샷 자동 연결)
const MAX_BYTES = 20000;          // 요청 본문 상한(남용 방지)

export default async function handler(req, res) {
  // 1) POST 만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST만 허용됩니다.' });
  }

  // 2) 같은 출처(도메인)에서 온 요청만 허용 — 이 엔드포인트를 무료 Claude 프록시로 악용하는 것 방지
  try {
    const origin = req.headers.origin || '';
    const host = req.headers.host || '';
    if (origin) {
      const oh = new URL(origin).host;
      const same = oh === host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(oh);
      if (!same) return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
    }
  } catch (_) { /* origin 파싱 실패는 무시 */ }

  // 3) 서버 키 확인
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다.' });

  // 4) 본문 파싱 + 크기 제한
  let body = req.body;
  if (typeof body === 'string') {
    if (body.length > MAX_BYTES) return res.status(413).json({ error: '요청이 너무 큽니다.' });
    try { body = JSON.parse(body); } catch { body = null; }
  }
  const channels = body && Array.isArray(body.channels) ? body.channels : null;
  if (!channels || !channels.length) return res.status(400).json({ error: 'channels 데이터가 없습니다.' });

  // 5) 서버에서 페이로드 정리(길이 상한) — 신뢰할 수 없는 입력을 그대로 넘기지 않음
  const clean = channels.slice(0, 3).map(c => ({
    채널: String(c.title || '').slice(0, 80),
    구독자: c.subs, 총영상: c.vidCount, 총조회: c.totalViews,
    최근평균조회: c.avgViews, 구독자대비배수: c.effVsSub, 영상당평균_전체: c.perVideoAvg,
    최근제목: Array.isArray(c.recent) ? c.recent.slice(0, 12).map(t => String(t).slice(0, 100)) : [],
    최근영상길이초: Array.isArray(c.durs) ? c.durs.slice(0, 12).map(n => +n || 0) : []
  }));

  const system =
    '너는 유튜브 성장 분석가다. 아래 2~3개 채널 데이터를 보고, 어느 채널이 구독자 대비 가장 잘 떡상했는지와 ' +
    '그 이유(제목 키워드 패턴, 영상 길이·포맷, 최근 추세)를 한국어 2~3문장으로 아주 구체적으로 써라. ' +
    '채널명·수치·실제 키워드를 반드시 인용하고, "비교한 결과입니다" 같은 맹탕 표현은 절대 금지. 첫 문장은 승자와 핵심 이유부터.';

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        system,
        messages: [{ role: 'user', content: '데이터(JSON):\n' + JSON.stringify(clean) }]
      })
    });

    if (!r.ok) {
      const detail = (await r.text()).slice(0, 200);
      return res.status(502).json({ error: 'Claude 호출 실패 (' + r.status + ')', detail });
    }

    const data = await r.json();
    const text = (data.content || []).map(b => (b.type === 'text' ? b.text : '')).join('').trim();
    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: '분석 중 오류가 발생했습니다.', detail: String((e && e.message) || e).slice(0, 200) });
  }
}
