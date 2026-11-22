// 上傳本機圖片：curl -s --data-binary @photo.jpg https://benirene-bali-2026.vercel.app/api/upload
// 回傳 {"url": "..."}，再用 MCP 的 add_photo 把 url 加到項目上。Vercel 單次請求上限約 4.5MB。
const { storeImage, readBody } = require('./_lib/photos');
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, PUT, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).json({ error: '用 POST 傳送圖片的二進位內容，例如 curl --data-binary @photo.jpg' });
  try {
    const buf = Buffer.isBuffer(req.body) ? req.body : await readBody(req);
    res.status(200).json(await storeImage(buf));
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
};
module.exports.config = { api: { bodyParser: false } };
