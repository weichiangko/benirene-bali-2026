// 旅程設定：封面、行前頁說明、主題。資料在 trip 表（只有一列 id='main'），修改一樣會留下紀錄。
const { storeImage, fetchImage, decodeBase64 } = require('./photos');
const THEMES = require('../../dist/themes.js');

const { SITE, SB_URL: URL_, SB_KEY: KEY } = require('./env');

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`資料庫錯誤 ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const TEXT = {
  title: ['封面大標題', 60], subtitle: ['封面副標（一句話）', 120], travelers: ['同行的人', 60], destination: ['目的地（英文，顯示在封面小字）', 60],
  intro: ['封面介紹文字', 600], cover_caption: ['封面照片說明', 80], cover_focus: ['封面照片對齊位置，例如 center、center 30%、left top', 30],
  prep_title: ['行前區塊標題', 40], prep_intro: ['行前區塊說明', 400], notes_title: ['須知分頁的名稱', 12],
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function row() {
  const r = await rest('trip?id=eq.main&select=*');
  if (r && r[0]) return r[0];
  return (await rest('trip', { method: 'POST', body: { id: 'main' }, prefer: 'return=representation' }))[0];
}
function brief(t) {
  const theme = THEMES.resolve(t.theme);
  return {
    title: t.title, subtitle: t.subtitle, travelers: t.travelers, destination: t.destination,
    start_date: t.start_date, end_date: t.end_date, intro: t.intro,
    cover_image: t.cover_image && !/^https?:/.test(t.cover_image) ? `${SITE}/${t.cover_image}` : t.cover_image,
    cover_caption: t.cover_caption, cover_focus: t.cover_focus, prep_title: t.prep_title, prep_intro: t.prep_intro,
    notes_tab: { enabled: t.notes_enabled !== false, title: t.notes_title || '入境與須知' },
    icon: { mode: t.icon_image ? 'image' : 'auto', image: t.icon_image || '', preview: `${SITE}/icon-512.png` },
    theme: { name: theme.name, based_on: theme.preset, saved: t.theme || {}, resolved: theme },
    link: `${SITE}/#prep`,
  };
}

async function getTrip() {
  const t = await row();
  return {
    ...brief(t),
    theme_presets: Object.fromEntries(Object.entries(THEMES.PRESETS).map(([k, p]) => [k, `${p.name}：${p.description}`])),
    color_fields: THEMES.COLOR_KEYS,
    map_styles: Object.fromEntries(Object.entries(THEMES.MAP_STYLES).map(([k, v]) => [k, v.name])),
    map_bases: Object.fromEntries(Object.entries(THEMES.MAP_BASES).map(([k, v]) => [k, v.name])),
    map_adjust: Object.fromEntries(Object.entries(THEMES.MAP_ADJUST).map(([k, v]) => [k, `${v[0]}（${v[1]}～${v[2]}，預設 ${v[3]}）`])),
  };
}

async function itemPhoto(itemId, index) {
  const r = await rest(`items?id=eq.${encodeURIComponent(itemId)}&select=id,title,photos`);
  if (!r || !r[0]) throw new Error(`找不到項目 ${itemId}`);
  const p = (r[0].photos || [])[(Number(index) || 1) - 1];
  if (!p) throw new Error(`項目 ${itemId} 沒有第 ${index || 1} 張照片`);
  return p;
}

async function updateTrip(args) {
  const t = await row();
  const patch = {};
  for (const [k, [label, max]] of Object.entries(TEXT)) {
    if (args[k] === undefined) continue;
    const v = String(args[k] ?? '').replace(/\s+/g, ' ').trim();
    if (v.length > max) throw new Error(`${label}最多 ${max} 個字`);
    patch[k] = v;
  }
  for (const k of ['start_date', 'end_date']) {
    if (args[k] === undefined) continue;
    if (args[k] === null || args[k] === '') { patch[k] = null; continue; }
    if (!DATE.test(args[k]) || isNaN(Date.parse(args[k]))) throw new Error(`${k} 格式要是 YYYY-MM-DD`);
    patch[k] = args[k];
  }
  if (args.notes_enabled !== undefined) patch.notes_enabled = !!args.notes_enabled;
  const s = patch.start_date !== undefined ? patch.start_date : t.start_date, e = patch.end_date !== undefined ? patch.end_date : t.end_date;
  if (s && e && e < s) throw new Error('結束日期不能早於出發日期');
  // 封面照片：行程裡某個項目的照片、網路圖片、或 base64
  if (args.cover_from_item) {
    const p = await itemPhoto(args.cover_from_item, args.cover_photo_index);
    patch.cover_image = p.image;
    if (args.cover_caption === undefined) patch.cover_caption = p.title || '';
  } else if (args.cover_image_base64) {
    patch.cover_image = (await storeImage(decodeBase64(args.cover_image_base64))).url;
  } else if (args.cover_image_url !== undefined) {
    const u = String(args.cover_image_url || '').trim();
    if (!u) patch.cover_image = '';
    else if (u.startsWith(`${URL_}/storage/v1/object/public/photos/`) || /^img\/[\w.-]+$/.test(u)) patch.cover_image = u;
    else if (u.startsWith(`${SITE}/img/`)) patch.cover_image = u.slice(SITE.length + 1);
    else patch.cover_image = (await storeImage(await fetchImage(u))).url;
  }
  if (!Object.keys(patch).length) throw new Error('沒有要修改的欄位');
  const r = await rest('trip?id=eq.main', { method: 'PATCH', body: patch, prefer: 'return=representation' });
  return { updated: Object.keys(patch), trip: brief(r[0]) };
}

async function setTheme(args) {
  const t = await row();
  const theme = THEMES.clean(args, t.theme);
  const r = await rest('trip?id=eq.main', { method: 'PATCH', body: { theme }, prefer: 'return=representation' });
  const res = THEMES.resolve(r[0].theme);
  const warnings = THEMES.check(res);
  return { theme: { name: res.name, based_on: res.preset, saved: r[0].theme, resolved: res }, ...(warnings.length ? { contrast_warnings: warnings, hint: '有文字不易閱讀，請調整對應顏色後再呼叫一次 set_theme' } : { contrast: '文字對比都足夠' }), note: '所有開著網站的人會立刻看到新主題', link: `${SITE}/#prep` };
}

// 網站圖示（favicon、手機主畫面、MCP）：上傳一張圖片，或 reset 回到依主題自動產生
async function setIcon(args) {
  await row();
  let url;
  if (args.reset) url = '';
  else if (args.from_item) url = (await itemPhoto(args.from_item, args.photo_index)).image;
  else if (args.image_base64) url = (await storeImage(decodeBase64(args.image_base64))).url;
  else if (args.image_url) {
    const u = String(args.image_url).trim();
    url = u.startsWith(`${URL_}/storage/v1/object/public/photos/`) ? u : (await storeImage(await fetchImage(u))).url;
  } else throw new Error('請提供 image_url、image_base64、from_item 其中之一，或 reset: true 回到自動圖示');
  if (url && !/^https?:/.test(url)) url = `${SITE}/${url}`; // 範本內建的 img/ 照片
  await rest('trip?id=eq.main', { method: 'PATCH', body: { icon_image: url } });
  return {
    icon: url ? 'image' : 'auto（依主題配色自動產生，換主題會跟著變）', image: url,
    preview: { png_512: `${SITE}/icon-512.png`, png_192: `${SITE}/icon-192.png`, svg: `${SITE}/icon.svg` },
    note: '圖片會置中裁成正方形，小尺寸也要看得清楚（主體大、背景單純）。瀏覽器分頁幾分鐘內更新；已加到手機主畫面的圖示由系統快取，可能要重新加入才會換。',
  };
}

module.exports = { getTrip, updateTrip, setTheme, setIcon, tripBrief: async () => brief(await row()) };
