// GET /api/export：整份行程的原始資料（天數、項目、待辦、說明、封面與主題），給「複製一份網站」當初始內容。
// 內容與網站上公開看得到的一樣，不含修改紀錄。
const { SB_URL, SB_KEY } = require('./_lib/env');

async function rows(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
  if (!r.ok) throw new Error(`資料庫錯誤 ${r.status}`);
  return r.json();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [days, items, checks, notes, trip] = await Promise.all([
      rows('days?select=*&order=position,id'), rows('items?select=*&order=position,id'),
      rows('checks?select=*&order=position,id'), rows('notes?select=*&order=position,id'), rows('trip?select=*'),
    ]);
    res.status(200).json({ exported_at: new Date().toISOString(), days, items, checks, notes, trip });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
};
