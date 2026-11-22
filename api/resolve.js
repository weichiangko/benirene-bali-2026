// /api/resolve?url=<Google 地圖連結>  或  /api/resolve?q=<地點名稱>
const { resolveLink, geocode } = require('./_lib/places');
module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    if (req.query.q) {
      const g = await geocode(String(req.query.q).slice(0, 200));
      return res.status(200).json(g ? { name: '', ...g, approx: true } : { latlng: null });
    }
    try { new URL(String(req.query.url || '')); } catch { return res.status(400).json({ error: 'bad url' }); }
    return res.status(200).json(await resolveLink(req.query.url));
  } catch (e) {
    return res.status(/Google/.test(e.message) ? 400 : 500).json({ error: String(e.message || e) });
  }
};
