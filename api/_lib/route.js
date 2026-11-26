// 依當天地點順序計算開車路線（OSRM），存進 days.route_geometry。
// route_sig 記錄計算時的地點組合；網頁比對不符時才會改畫虛線。
const { SB_URL: URL_, SB_KEY: KEY, UA } = require('./env');
const OSRM = 'https://router.project-osrm.org/route/v1/driving/';

async function rest(path, opt = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method: opt.method || 'GET',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (!r.ok) throw new Error(`資料庫錯誤 ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// 必須與網頁 app.js 的 sigOf 一致；開車不加標記，舊的簽章因此仍然有效
const sigOf = pts => pts.map(p => (+p[0]).toFixed(5) + ',' + (+p[1]).toFixed(5) + (p[2] && p[2] !== 'car' ? '@' + p[2] : '')).join(';');

async function osrm(pts) {
  try {
    const r = await fetch(`${OSRM}${pts.map(p => `${p[1]},${p[0]}`).join(';')}?overview=full&geometries=geojson`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const j = await r.json();
    return j.code === 'Ok' && j.routes && j.routes[0] ? j.routes[0].geometry.coordinates : null;
  } catch { return null; }
}
const line = (a, b) => [[a[1], a[0]], [b[1], b[0]]];
const feature = (mode, coordinates) => ({ type: 'Feature', properties: { mode }, geometry: { type: 'LineString', coordinates } });

// 每一段的交通方式 = 抵達那一站的 travel_mode。
// 連續的開車路段一起丟給 OSRM；搭船／飛機畫直線；開車算不出來的那段標成 straight（網頁畫虛線）。
async function routeFor(pts) {
  const feats = [];
  let i = 0;
  while (i < pts.length - 1) {
    const mode = pts[i + 1][2] || 'car';
    if (mode !== 'car') { feats.push(feature(mode, line(pts[i], pts[i + 1]))); i++; continue; }
    let j = i + 1;
    while (j < pts.length - 1 && (pts[j + 1][2] || 'car') === 'car') j++;
    const chain = pts.slice(i, j + 1);
    const whole = await osrm(chain);
    if (whole) feats.push(feature('car', whole));
    else for (let k = 0; k < chain.length - 1; k++) {
      const seg = await osrm([chain[k], chain[k + 1]]);
      feats.push(seg ? feature('car', seg) : feature('straight', line(chain[k], chain[k + 1])));
    }
    i = j;
  }
  return { type: 'FeatureCollection', features: feats };
}

// 重算所有地點組合已改變的天；回傳更新了哪些天
async function syncRoutes() {
  const [days, items] = await Promise.all([
    rest('days?select=id,position,route_sig&order=position,id'),
    rest('items?select=day_id,position,id,lat,lng,travel_mode&lat=not.is.null&order=position,id'),
  ]);
  const done = [];
  for (const d of days) {
    const pts = items.filter(x => x.day_id === d.id && x.lng != null).map(x => [x.lat, x.lng, x.travel_mode || 'car']);
    const sig = sigOf(pts);
    if (sig === (d.route_sig || '')) continue;
    const geometry = pts.length > 1 ? await routeFor(pts) : null;
    await rest(`days?id=eq.${d.id}`, { method: 'PATCH', body: { route_geometry: geometry, route_sig: sig } });
    done.push({ day_id: d.id, points: pts.length, segments: geometry ? geometry.features.map(f => f.properties.mode) : [] });
  }
  return done;
}

module.exports = { syncRoutes, sigOf };
