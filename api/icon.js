// 網站圖示：/icon.svg、/icon-192.png、/icon-512.png、/apple-touch-icon.png（vercel.json 改寫到這裡）
const { SB_URL, SB_KEY } = require('./_lib/env');
const { iconSvg, toPng } = require('./_lib/icon');

async function trip() {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/trip?id=eq.main&select=theme,icon_image`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}

module.exports = async function handler(req, res) {
  const size = Math.max(16, Math.min(1024, parseInt(req.query.size, 10) || 0));
  const svg = await iconSvg(await trip());
  // 換圖示或主題後幾分鐘內生效；過期時先回舊的、背景更新
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300, stale-while-revalidate=86400');
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.query.f === 'svg' || !req.query.size) {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.status(200).send(svg);
  }
  res.setHeader('Content-Type', 'image/png');
  return res.status(200).send(toPng(svg, size));
};
