// 重算地點有變動的那幾天的道路路線：POST /api/route
const { syncRoutes } = require('./_lib/route');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try { res.status(200).json({ updated: await syncRoutes() }); }
  catch (e) { res.status(500).json({ error: String(e.message || e) }); }
};
