// 行程資料的讀寫（給 MCP / AI agent 使用）。透過 Supabase REST，寫入一樣會留下修改紀錄。
const { resolveLink, geocode } = require('./places');
const { storeImage, fetchImage, decodeBase64 } = require('./photos');

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
const one = rows => (Array.isArray(rows) ? rows[0] : rows);
const enc = encodeURIComponent;

/* ---------- 文字：AI 用純文字與 [文字](網址)，存成安全 HTML ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toHtml(text) {
  const links = [];
  let s = String(text ?? '').trim().replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => { links.push([t, u]); return `\u0000${links.length - 1}\u0000`; });
  s = esc(s).replace(/https?:\/\/[^\s<>"'（）)]+/g, u => `<a href="${esc(u.replace(/&amp;/g, '&'))}" target="_blank" rel="noopener noreferrer">${u}</a>`);
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => { const [t, u] = links[+i]; return `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t)}</a>`; });
}
function toText(html) {
  return String(html ?? '')
    .replace(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g, (_, u, t) => { u = u.replace(/&amp;/g, '&'); t = t.replace(/<[^>]+>/g, ''); return t && t !== u ? `[${t}](${u})` : u; })
    .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}
const plainIn = t => esc(String(t ?? '').trim());
const listIn = v => (Array.isArray(v) ? v : String(v ?? '').split('\n')).map(s => String(s).trim()).filter(Boolean).map(toHtml);

/* ---------- 讀取 ---------- */
async function loadAll() {
  const [days, items, checks, notes] = await Promise.all([
    rest('days?select=id,position,date,title,area,note,breakfast,map_note&order=position,id'),
    rest('items?select=*&order=position,id'),
    rest('checks?select=*&order=position,id'),
    rest('notes?select=*&order=position,id'),
  ]);
  days.forEach((d, i) => { d.number = i + 1; d.items = items.filter(x => x.day_id === d.id); });
  return { days, items, checks, notes };
}
async function dayByNumber(n) {
  const { days } = await loadAll();
  const d = days[Number(n) - 1];
  if (!d) throw new Error(`沒有第 ${n} 天（目前共 ${days.length} 天）`);
  return { d, days };
}
const minutes = s => { const m = toText(s).match(/(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
function itemBrief(x) {
  return { id: x.id, time: toText(x.time), title: toText(x.title), type: toText(x.type), note: toText(x.note), has_location: x.lat != null, ...(x.travel_mode && x.travel_mode !== 'car' ? { travel_mode: x.travel_mode } : {}), ...(x.reserve ? { reserve: toText(x.reserve) } : {}) };
}
function itemFull(x, days) {
  const d = days && days.find(d => d.id === x.day_id);
  return {
    id: x.id, day: d ? d.number : undefined, time: toText(x.time), title: toText(x.title), type: toText(x.type), note: toText(x.note),
    location: x.lat != null ? { lat: x.lat, lng: x.lng } : null, travel_mode: x.travel_mode || 'car', google_maps_url: x.map_url || (x.lat != null ? `https://www.google.com/maps/search/?api=1&query=${x.lat},${x.lng}` : ''),
    reserve: toText(x.reserve), booking_url: x.book_url, food: x.food.map(toText), booking: x.booking.map(toText), notes_for_day: x.extra.map(toText), rain_plan: x.rain.map(toText),
    photos: (x.photos || []).map((p, i) => ({ index: i + 1, title: p.title || '', caption: p.caption || '', credit: p.credit || '', url: /^https?:/.test(p.image) ? p.image : `${SITE}/${p.image}` })), link: `${SITE}/#${x.id}`,
  };
}

async function getItinerary({ day } = {}) {
  const all = await loadAll();
  if (day) {
    const d = all.days[Number(day) - 1];
    if (!d) throw new Error(`沒有第 ${day} 天`);
    return { day: d.number, date: d.date, title: d.title, area: d.area, summary: d.note, breakfast: d.breakfast, items: d.items.map(x => itemFull(x, all.days)), link: `${SITE}/#d${d.number}` };
  }
  return {
    site: SITE,
    days: all.days.map(d => ({ day: d.number, date: d.date, title: d.title, area: d.area, summary: d.note, items: d.items.map(itemBrief) })),
    checklist: all.checks.map(c => ({ id: c.id, title: c.title, detail: c.detail, done: c.done })),
    note_sections: all.notes.map(n => ({ id: n.id, title: n.title })),
  };
}
async function getItem({ item_id }) {
  const all = await loadAll();
  const x = all.items.find(x => x.id === item_id);
  if (!x) throw new Error(`找不到項目 ${item_id}`);
  return itemFull(x, all.days);
}
async function search({ query }) {
  const q = String(query || '').toLowerCase();
  const all = await loadAll();
  const hits = [];
  all.days.forEach(d => d.items.forEach(x => {
    const t = [x.title, x.type, x.note, ...x.food, ...x.booking, ...x.extra, ...x.rain].map(toText).join(' ');
    if (t.toLowerCase().includes(q)) hits.push({ day: d.number, ...itemBrief(x) });
  }));
  return { query, results: hits.slice(0, 30) };
}

/* ---------- 位置與排序 ---------- */
// 行程現有地點的中心，讓「只給名稱」的搜尋偏向這趟旅程的區域
async function tripCenter() {
  try {
    const pts = await rest('items?select=lat,lng&lat=not.is.null&lng=not.is.null');
    if (!pts || !pts.length) return null;
    const lat = pts.map(p => p.lat).sort((a, b) => a - b), lng = pts.map(p => p.lng).sort((a, b) => a - b);
    return { lat: lat[lat.length >> 1], lng: lng[lng.length >> 1] }; // 中位數，不受零星遠點影響
  } catch { return null; }
}
async function locate({ google_maps_url, place_name, lat, lng }) {
  if (lat != null && lng != null) return { latlng: [+lat, +lng], url: google_maps_url || '', name: '' };
  if (google_maps_url) { const r = await resolveLink(google_maps_url, await tripCenter()); return { latlng: r.latlng, url: google_maps_url, name: r.name, approx: r.approx }; }
  if (place_name) { const g = await geocode(place_name, await tripCenter()); return g ? { latlng: g.latlng, url: '', name: '', approx: true, label: g.label } : null; }
  return null;
}
function posForTime(items, time, selfId) {
  const its = items.filter(x => x.id !== selfId);
  const last = its.length ? Math.max(...its.map(x => x.position)) + 10 : 0;
  const tv = minutes(time);
  if (tv == null || !its.length) return last;
  const i = its.findIndex(x => { const v = minutes(x.time); return v != null && v > tv; });
  if (i < 0) return last;
  const after = its[i].position, before = i > 0 ? its[i - 1].position : after - 20;
  return (before + after) / 2;
}

/* ---------- 寫入 ---------- */
const ITEM_FIELDS = {
  time: ['time', plainIn], title: ['title', plainIn], type: ['type', plainIn], note: ['note', toHtml], reserve: ['reserve', plainIn],
  booking_url: ['book_url', v => String(v || '').trim()], travel_mode: ['travel_mode', v => { const m = String(v || 'car').trim(); if (!['car', 'boat', 'plane'].includes(m)) throw new Error('travel_mode 只能是 car、boat、plane'); return m; }], food: ['food', listIn], booking: ['booking', listIn], notes_for_day: ['extra', listIn], rain_plan: ['rain', listIn],
};
function itemPatch(args) {
  const p = {};
  for (const [k, [col, f]] of Object.entries(ITEM_FIELDS)) if (args[k] !== undefined) p[col] = f(args[k]);
  return p;
}
async function addPlace(args) {
  const { d } = await dayByNumber(args.day);
  const loc = await locate(args);
  const title = args.title || (loc && loc.name) || args.place_name;
  if (!title) throw new Error('請提供 title、place_name 或 google_maps_url 其中之一');
  const row = { day_id: d.id, title: plainIn(title), ...itemPatch({ ...args, title: undefined }) };
  if (loc && loc.latlng) { row.lat = loc.latlng[0]; row.lng = loc.latlng[1]; }
  row.map_url = (loc && loc.url) || '';
  row.position = posForTime(d.items, row.time || '', null);
  const saved = one(await rest('items', { method: 'POST', body: row, prefer: 'return=representation' }));
  return { added: itemBrief(saved), day: d.number, location: loc && loc.latlng ? { lat: saved.lat, lng: saved.lng, approximate: !!loc.approx } : null, link: `${SITE}/#${saved.id}`, ...(loc && loc.approx ? { warning: '位置是依名稱搜尋的結果，請確認是否正確' } : {}), ...(!loc || !loc.latlng ? { warning: '沒有找到位置，這個項目不會出現在地圖上；可再用 update_item 提供 google_maps_url 或 lat/lng' } : {}) };
}
async function updateItem(args) {
  const all = await loadAll();
  const x = all.items.find(x => x.id === args.item_id);
  if (!x) throw new Error(`找不到項目 ${args.item_id}`);
  const p = itemPatch(args);
  if (args.google_maps_url !== undefined || args.place_name !== undefined || (args.lat != null && args.lng != null)) {
    const loc = await locate(args);
    if (loc && loc.latlng) { p.lat = loc.latlng[0]; p.lng = loc.latlng[1]; }
    if (args.google_maps_url !== undefined) p.map_url = String(args.google_maps_url || '');
  }
  if (args.clear_location) { p.lat = null; p.lng = null; }
  let dayItems = all.days.find(d => d.id === x.day_id).items;
  if (args.day !== undefined) { const d = all.days[Number(args.day) - 1]; if (!d) throw new Error(`沒有第 ${args.day} 天`); p.day_id = d.id; dayItems = d.items; }
  if (p.day_id !== undefined || p.time !== undefined) p.position = posForTime(dayItems, p.time ?? x.time, x.id);
  if (!Object.keys(p).length) throw new Error('沒有要修改的欄位');
  const saved = one(await rest(`items?id=eq.${enc(x.id)}`, { method: 'PATCH', body: p, prefer: 'return=representation' }));
  return { updated: itemFull(saved, all.days) };
}
async function moveItem({ item_id, direction }) {
  const all = await loadAll();
  const x = all.items.find(x => x.id === item_id);
  if (!x) throw new Error(`找不到項目 ${item_id}`);
  const its = all.days.find(d => d.id === x.day_id).items, i = its.indexOf(x), j = i + (direction === 'up' ? -1 : 1);
  if (j < 0 || j >= its.length) return { unchanged: '已經在最前或最後' };
  const y = its[j];
  await rest(`items?id=eq.${enc(x.id)}`, { method: 'PATCH', body: { position: y.position === x.position ? x.position + (j - i) : y.position } });
  await rest(`items?id=eq.${enc(y.id)}`, { method: 'PATCH', body: { position: x.position } });
  return { moved: item_id, direction };
}
async function deleteRow(table, id, label) {
  const rows = await rest(`${table}?id=eq.${enc(id)}`, { method: 'DELETE', prefer: 'return=representation' });
  if (!rows || !rows.length) throw new Error(`找不到 ${label} ${id}`);
  return { deleted: id, title: toText(rows[0].title), undo: '可用 get_history 找到這筆刪除，再用 undo_change 還原' };
}
async function updateDay(args) {
  const { d } = await dayByNumber(args.day);
  const p = {};
  for (const k of ['date', 'title', 'area', 'note', 'breakfast']) if (args[k] !== undefined) p[k] = String(args[k]).trim();
  if (args.summary !== undefined) p.note = String(args.summary).trim();
  if (!Object.keys(p).length) throw new Error('沒有要修改的欄位');
  const saved = one(await rest(`days?id=eq.${d.id}`, { method: 'PATCH', body: p, prefer: 'return=representation' }));
  return { updated_day: args.day, ...p, title: saved.title };
}
async function addDay(args) {
  const { days } = await loadAll();
  const position = days.length ? Math.max(...days.map(d => d.position)) + 10 : 0;
  await rest('days', { method: 'POST', body: { position, date: String(args.date || '').trim(), title: String(args.title || '').trim(), area: String(args.area || '').trim(), note: String(args.summary || '').trim(), breakfast: String(args.breakfast || '').trim() } });
  return { added_day: days.length + 1 };
}
async function deleteDay({ day }) {
  const { d } = await dayByNumber(day);
  await rest(`days?id=eq.${d.id}`, { method: 'DELETE' });
  return { deleted_day: day, title: d.title, removed_items: d.items.length, undo: '用 get_history 找到這天與各項目的刪除紀錄，用 undo_change 逐筆還原（先還原日程，再還原項目）' };
}
async function checklistAdd({ title, detail }) {
  const { checks } = await loadAll();
  const position = checks.length ? Math.max(...checks.map(c => c.position)) + 10 : 0;
  const r = one(await rest('checks', { method: 'POST', body: { position, title: String(title).trim(), detail: String(detail || '').trim() }, prefer: 'return=representation' }));
  return { added: { id: r.id, title: r.title } };
}
async function checklistUpdate(args) {
  const p = {};
  for (const k of ['title', 'detail']) if (args[k] !== undefined) p[k] = String(args[k]).trim();
  if (args.done !== undefined) p.done = !!args.done;
  const r = one(await rest(`checks?id=eq.${enc(args.check_id)}`, { method: 'PATCH', body: p, prefer: 'return=representation' }));
  if (!r) throw new Error(`找不到待辦 ${args.check_id}`);
  return { updated: { id: r.id, title: r.title, detail: r.detail, done: r.done } };
}
async function getNote({ note_id }) {
  const r = one(await rest(`notes?id=eq.${enc(note_id)}`));
  if (!r) throw new Error(`找不到說明區塊 ${note_id}`);
  return { id: r.id, title: r.title, paragraphs: r.paragraphs.map(toText) };
}
async function saveNote(args) {
  const body = {};
  if (args.title !== undefined) body.title = String(args.title).trim();
  if (args.paragraphs !== undefined) body.paragraphs = listIn(args.paragraphs);
  if (args.note_id) { const r = one(await rest(`notes?id=eq.${enc(args.note_id)}`, { method: 'PATCH', body, prefer: 'return=representation' })); if (!r) throw new Error('找不到說明區塊'); return { updated: r.id }; }
  const { notes } = await loadAll();
  body.position = notes.length ? Math.max(...notes.map(n => n.position)) + 10 : 0;
  const r = one(await rest('notes', { method: 'POST', body, prefer: 'return=representation' }));
  return { added: r.id };
}
/* ---------- 照片 ---------- */
async function itemRow(id) {
  const x = one(await rest(`items?id=eq.${enc(id)}&select=id,title,photos`));
  if (!x) throw new Error(`找不到項目 ${id}`);
  return x;
}
async function savePhotos(id, photos) {
  await rest(`items?id=eq.${enc(id)}`, { method: 'PATCH', body: { photos } });
  return photos.map((p, i) => ({ index: i + 1, title: p.title, url: /^https?:/.test(p.image) ? p.image : `${SITE}/${p.image}` }));
}
async function addPhoto(args) {
  const x = await itemRow(args.item_id);
  let buf;
  if (args.image_base64) buf = decodeBase64(args.image_base64);
  else if (args.image_url) {
    if (String(args.image_url).startsWith(`${URL_}/storage/v1/object/public/photos/`)) buf = null; // 已上傳過，直接使用
    else buf = await fetchImage(args.image_url);
  } else throw new Error('請提供 image_url（網路上的圖片或 /api/upload 回傳的網址）或 image_base64');
  const url = buf ? (await storeImage(buf)).url : String(args.image_url);
  const photo = { title: String(args.title || toText(x.title)).trim(), image: url, caption: String(args.caption || '').trim(), source: String(args.source || (args.image_url && buf ? args.image_url : '')).trim(), credit: String(args.credit || '').trim(), tag: '' };
  const photos = [...(x.photos || [])];
  const at = args.position ? Math.max(0, Math.min(photos.length, Number(args.position) - 1)) : photos.length;
  photos.splice(at, 0, photo);
  return { added_photo: url, item: args.item_id, photos: await savePhotos(x.id, photos), link: `${SITE}/#${x.id}`, note: '第 1 張照片會顯示在地圖卡片上' };
}
async function updatePhoto(args) {
  const x = await itemRow(args.item_id);
  const photos = [...(x.photos || [])], i = Number(args.index) - 1;
  if (!photos[i]) throw new Error(`這個項目沒有第 ${args.index} 張照片（共 ${photos.length} 張）`);
  const p = { ...photos[i] };
  for (const k of ['title', 'caption', 'credit', 'source']) if (args[k] !== undefined) p[k] = String(args[k]).trim();
  photos.splice(i, 1);
  const to = args.move_to ? Math.max(0, Math.min(photos.length, Number(args.move_to) - 1)) : i;
  photos.splice(to, 0, p);
  return { updated_photo: to + 1, photos: await savePhotos(x.id, photos) };
}
async function removePhoto(args) {
  const x = await itemRow(args.item_id);
  const photos = [...(x.photos || [])], i = Number(args.index) - 1;
  if (!photos[i]) throw new Error(`這個項目沒有第 ${args.index} 張照片（共 ${photos.length} 張）`);
  const [gone] = photos.splice(i, 1);
  return { removed_photo: gone.title, photos: await savePhotos(x.id, photos), undo: '可用 get_history + undo_change 還原' };
}

const OP = { INSERT: '新增', UPDATE: '修改', DELETE: '刪除' };
async function getHistory({ limit = 20 } = {}) {
  const rows = await rest(`history?select=id,at,tbl,row_id,op,old,new&order=at.desc&limit=${Math.min(+limit || 20, 100)}`);
  return { changes: rows.map(h => ({ history_id: h.id, at: h.at, action: `${OP[h.op] || h.op} ${h.tbl}`, row_id: h.row_id, title: toText((h.new || h.old || {}).title || '') })) };
}
async function undoChange({ history_id }) {
  const h = one(await rest(`history?id=eq.${+history_id}`));
  if (!h) throw new Error(`找不到紀錄 ${history_id}`);
  if (h.op === 'INSERT') await rest(`${h.tbl}?id=eq.${enc(h.new.id)}`, { method: 'DELETE' });
  else { const o = { ...h.old }; delete o.updated_at; await rest(h.tbl, { method: 'POST', body: o, prefer: 'resolution=merge-duplicates' }); }
  return { undone: history_id, action: `已撤銷：${OP[h.op]} ${h.tbl} ${toText((h.new || h.old || {}).title || '')}` };
}

module.exports = {
  SITE, tripCenter, getItinerary, getItem, search, addPlace, updateItem, moveItem, updateDay, addDay, deleteDay,
  deleteItem: ({ item_id }) => deleteRow('items', item_id, '項目'),
  checklistAdd, checklistUpdate, checklistDelete: ({ check_id }) => deleteRow('checks', check_id, '待辦'),
  getNote, saveNote, deleteNote: ({ note_id }) => deleteRow('notes', note_id, '說明區塊'),
  getHistory, undoChange, addPhoto, updatePhoto, removePhoto,
};
