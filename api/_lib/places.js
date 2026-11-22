// 解析 Google 地圖連結（含 maps.app.goo.gl 短網址）→ 地點名稱與座標。
const ALLOWED = /(^|\.)(goo\.gl|g\.co|google\.[a-z.]+)$/i;
const BALI = { lat: -8.45, lon: 115.2, box: [-9.0, -7.9, 114.4, 115.8] };
const fix = n => +(+n).toFixed(6);
const ok = (a, b) => Math.abs(a) <= 90 && Math.abs(b) <= 180;

function coordsFrom(s) {
  // !3d!4d 是地點本身；@ 是畫面中心，放後面
  const pats = [/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, /[?&](?:q|query|ll|destination|daddr)=(-?\d+\.\d+)(?:,|%2C)\s*(-?\d+\.\d+)/i, /@(-?\d+\.\d+),(-?\d+\.\d+)/];
  for (const p of pats) { const m = s.match(p); if (m && ok(+m[1], +m[2])) return [fix(m[1]), fix(m[2])]; }
  return null;
}
function nameFrom(u) {
  const dec = s => { try { return decodeURIComponent(s.replace(/\+/g, ' ')).trim(); } catch { return s; } };
  const m = u.pathname.match(/\/maps\/place\/([^/@]+)/);
  if (m) return dec(m[1]).split(',')[0].trim();
  const q = u.searchParams.get('q') || u.searchParams.get('query') || u.searchParams.get('destination');
  if (q && !/^-?\d+\.\d+\s*,\s*-?\d+\.\d+$/.test(q)) return q.split(',')[0].trim();
  return '';
}
async function geocode(q) {
  if (!q) return null;
  const r = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&lat=${BALI.lat}&lon=${BALI.lon}&limit=6`, { headers: { 'User-Agent': 'bali-trip-site/1.0' } });
  if (!r.ok) return null;
  const j = await r.json();
  const [s, n, w, e] = BALI.box;
  const fs = (j.features || []).filter(f => { const [lon, lat] = f.geometry.coordinates; return lat > s && lat < n && lon > w && lon < e; });
  const f = fs[0] || (j.features || [])[0];
  if (!f) return null;
  const p = f.properties || {};
  return { latlng: [fix(f.geometry.coordinates[1]), fix(f.geometry.coordinates[0])], label: [p.name, p.street, p.city || p.county].filter(Boolean).join(', '), inBali: !!fs[0] };
}


// 解析 Google 地圖連結 → {url, name, latlng, approx}
async function resolveLink(raw) {
  let url = new URL(String(raw || '').trim());
  for (let i = 0; i < 6; i++) {
    if (!/^https?:$/.test(url.protocol) || !ALLOWED.test(url.hostname)) throw new Error('只接受 Google 地圖連結');
    const ll = coordsFrom(url.href), name = nameFrom(url);
    if (ll) return { url: url.href, latlng: ll, name };
    const r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 'Accept-Language': 'zh-TW,en;q=0.8' } });
    const loc = r.headers.get('location');
    if (loc) { url = new URL(loc, url); continue; }
    const body = r.status === 200 ? (await r.text()).slice(0, 400000) : '';
    const m = body.match(/center=(-?\d+\.\d+)%2C(-?\d+\.\d+)/) || body.match(/\[null,null,(-?\d+\.\d+),(-?\d+\.\d+)\]/);
    if (m && ok(+m[1], +m[2])) return { url: url.href, latlng: [fix(m[1]), fix(m[2])], name };
    const g = await geocode(name);
    return { url: url.href, name, latlng: g ? g.latlng : null, approx: !!g };
  }
  return { url: url.href, latlng: coordsFrom(url.href), name: nameFrom(url) };
}
module.exports = { resolveLink, geocode, coordsFrom };
