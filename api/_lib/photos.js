// 照片：驗證、下載、上傳到 Supabase Storage（公開讀取的 photos bucket）。
const crypto = require('crypto');

const URL_ = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
const BUCKET = 'photos';
const MAX = 8 * 1024 * 1024;

// 依檔頭判斷格式，不信任副檔名或 Content-Type
function sniff(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ['image/jpeg', 'jpg'];
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return ['image/png', 'png'];
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return ['image/webp', 'webp'];
  if (buf.slice(0, 4).toString() === 'GIF8') return ['image/gif', 'gif'];
  return null;
}

async function storeImage(buf) {
  if (!SERVICE) throw new Error('伺服器未設定儲存金鑰');
  if (!buf || !buf.length) throw new Error('沒有收到圖片內容');
  if (buf.length > MAX) throw new Error(`圖片太大（${(buf.length / 1048576).toFixed(1)}MB），上限 8MB`);
  const t = sniff(buf);
  if (!t) throw new Error('只接受 JPEG、PNG、WebP、GIF 圖片（HEIC 請先轉成 JPEG）');
  const d = new Date();
  const path = `items/${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}/${crypto.randomBytes(8).toString('hex')}.${t[1]}`;
  const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE}`, apikey: SERVICE, 'Content-Type': t[0], 'Cache-Control': 'public, max-age=31536000, immutable' },
    body: buf,
  });
  if (!r.ok) throw new Error(`上傳失敗 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { url: `${URL_}/storage/v1/object/public/${BUCKET}/${path}`, type: t[0], bytes: buf.length };
}

const PRIVATE = /^(localhost|.*\.local|.*\.internal|0\.0\.0\.0|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?|\[?f[cd][0-9a-f]{2}:)/i;
async function fetchImage(raw) {
  let u;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('image_url 不是有效網址'); }
  if (!/^https?:$/.test(u.protocol) || PRIVATE.test(u.hostname)) throw new Error('image_url 必須是公開的 http(s) 網址');
  const r = await fetch(u, { redirect: 'follow', headers: { 'User-Agent': 'bali-trip-site/1.0 (+https://benirene-bali-2026.vercel.app/ai)', Accept: 'image/*' } });
  if (!r.ok) throw new Error(`下載圖片失敗 ${r.status}`);
  if (+r.headers.get('content-length') > MAX) throw new Error('圖片太大，上限 8MB');
  const chunks = []; let n = 0;
  for await (const c of r.body) { n += c.length; if (n > MAX) throw new Error('圖片太大，上限 8MB'); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}

function decodeBase64(s) {
  const m = String(s).match(/^data:[^;]+;base64,(.*)$/s);
  return Buffer.from((m ? m[1] : s).replace(/\s+/g, ''), 'base64');
}

async function readBody(req, limit = MAX) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw new Error('圖片太大，上限 8MB'); chunks.push(Buffer.from(c)); }
  return Buffer.concat(chunks);
}

module.exports = { storeImage, fetchImage, decodeBase64, readBody, sniff, MAX };
