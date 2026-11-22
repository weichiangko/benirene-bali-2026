// MCP 伺服器（Streamable HTTP，無狀態）：讓任何支援 MCP 的 AI 讀取與編輯行程。
// 端點：https://benirene-bali-2026.vercel.app/api/mcp
const T = require('./_lib/trip');
const { syncRoutes } = require('./_lib/route');
const ST = require('./_lib/settings');
const THEMES = require('../dist/themes.js');

const str = d => ({ type: 'string', description: d });
const ITEM_PROPS = {
  time: str('時間，例如 "19:00" 或 "約 19:00–20:00"。會依時間自動排序'),
  type: str('類型，例如 景點、餐廳、咖啡、行程、交通、住宿、按摩、購物'),
  note: str('標題下方的一句簡短說明'),
  reserve: str('預訂狀態，例如 "需訂位"、"待購買"、"已訂"。訂好後改成「已訂」或「已購買」，網站的預訂入口就不再列出這一項（連結仍保留在項目裡）'),
  booking_url: str('預訂連結'),
  travel_mode: { type: 'string', enum: ['car', 'boat', 'plane'], description: '從前一個地點到這裡的交通方式：car 開車（預設，地圖沿道路畫實線）、boat 搭船、plane 搭飛機（地圖畫直線虛線）。例如到佩尼達島的快艇碼頭→島上第一站用 boat' },
  food: { type: 'array', items: { type: 'string' }, description: '吃什麼／必點，每段一個字串' },
  booking: { type: 'array', items: { type: 'string' }, description: '預訂方式說明，每段一個字串' },
  notes_for_day: { type: 'array', items: { type: 'string' }, description: '當天注意事項' },
  rain_plan: { type: 'array', items: { type: 'string' }, description: '雨天／延誤的替代方案' },
};
const LOC_PROPS = {
  google_maps_url: str('Google 地圖連結（含 maps.app.goo.gl 短網址）。會自動帶入名稱與座標，最推薦'),
  place_name: str('地點名稱；沒有連結時用名稱搜尋位置（結果為近似，需提醒使用者確認）'),
  lat: { type: 'number', description: '緯度（已知精確座標時）' }, lng: { type: 'number', description: '經度' },
};
const obj = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const dayN = { type: 'integer', minimum: 1, description: '第幾天（1 起算）' };

async function itinerary(a = {}) {
  const r = await T.getItinerary(a);
  if (!a.day) { try { const t = await ST.tripBrief(); r.trip = { title: t.title, travelers: t.travelers, start_date: t.start_date, end_date: t.end_date, theme: t.theme.preset_name, cover: t.link }; } catch (e) { /* 封面設定讀不到不影響行程 */ } }
  return r;
}

// ChatGPT（深度研究、公司知識）只認這兩個標準工具名稱與回傳格式
async function stdSearch({ query }) {
  const r = await T.search({ query });
  const it = await T.getItinerary({});
  const q = String(query || '').toLowerCase();
  const days = it.days.filter(d => `${d.title} ${d.area} ${d.summary} ${d.date}`.toLowerCase().includes(q))
    .map(d => ({ id: `d${d.day}`, title: `DAY ${d.day} · ${d.date} · ${d.title}`, url: `${T.SITE}/#d${d.day}` }));
  return { results: [...days, ...r.results.map(x => ({ id: x.id, title: `DAY ${x.day} · ${x.title}`, url: `${T.SITE}/#${x.id}` }))].slice(0, 30) };
}
async function stdFetch({ id }) {
  const m = String(id || '').match(/^d(\d+)$/);
  if (m) { const d = await T.getItinerary({ day: +m[1] }); return { id, title: `DAY ${d.day} · ${d.date} · ${d.title}`, text: JSON.stringify(d, null, 1), url: d.link, metadata: { type: 'day' } }; }
  if (id === 'trip' || id === 'prep') { const t = await ST.getTrip(); return { id, title: t.title, text: JSON.stringify(t, null, 1), url: t.link, metadata: { type: 'trip' } }; }
  const x = await T.getItem({ item_id: id });
  return { id, title: x.title, text: JSON.stringify(x, null, 1), url: `${T.SITE}/#${id}`, metadata: { type: 'item' } };
}

const TOOLS = [
  ['get_itinerary', '讀取行程。不給 day 回傳封面摘要、全部天數的摘要、行前待辦清單與說明區塊；給 day 回傳那天每個項目的完整內容。編輯前先呼叫以取得 item id。', obj({ day: dayN }), itinerary, true],
  ['get_trip', '讀取封面（旅程標題、日期、介紹、封面照片）、行前區塊的標題與說明、目前主題（配色、字體、地圖風格），以及可用的主題與顏色欄位。', obj({}), ST.getTrip, true],
  ['update_trip', '修改封面與行前區塊：旅程標題、副標、同行的人、目的地、出發／結束日期（封面倒數用）、介紹文字、封面照片、行前區塊標題與說明、須知分頁開關（國內行程關掉、國外行程打開）。只傳要改的欄位。封面照片可用 cover_from_item（行程中某項目的照片）、cover_image_url（網路圖片或 /api/upload 回傳網址）、cover_image_base64。', obj({
    title: str('封面大標題，例如「峇里島跨年」'), subtitle: str('封面副標，一句話'), travelers: str('同行的人，例如「Ben & Irene」'), destination: str('目的地英文，例如「Bali, Indonesia」，顯示在封面小字'),
    start_date: str('出發日期 YYYY-MM-DD'), end_date: str('回程日期 YYYY-MM-DD'), intro: str('封面介紹文字（2–3 句）'),
    cover_from_item: str('用這個項目 id 的照片當封面'), cover_photo_index: { type: 'integer', minimum: 1, description: '搭配 cover_from_item：第幾張照片，預設 1' },
    cover_image_url: str('封面照片網址；空字串表示不用照片'), cover_image_base64: str('封面照片 base64'), cover_caption: str('封面照片說明'),
    cover_focus: str('照片對齊位置（CSS object-position），例如 center、center 30%、left top；主體被裁到時調整'),
    prep_title: str('行前區塊標題'), prep_intro: str('行前區塊說明文字'),
    notes_enabled: { type: 'boolean', description: '行前區塊要不要顯示「須知」分頁。出國行程用 true（簽證、入境申報、旅遊稅、海關等）；國內行程通常不需要，用 false，只留「待辦與預訂」' },
    notes_title: str('須知分頁的名稱，預設「入境與須知」；例如日本可用「入境與須知」，國內長途可用「出發須知」'),
  }), ST.updateTrip],
  ['set_theme', '設計整個網站的主題（配色、字體、地圖底圖與色調），所有人立即看到。規劃新目的地或使用者想換風格時，請依目的地文化與封面照片自己設計一套主題：傳完整的 colors（全部欄位）、fonts（標題與內文各一個 Google Fonts 字體）、map_style 加上 map 細調（底圖、飽和、亮度、染色等，讓地圖色調跟主題一致），並取個 name（例如「羅馬・大理石與赭紅」）。preset 只是起點範例，不必只用預設。回傳 contrast_warnings 時請修正顏色再呼叫一次。', obj({
    name: str('這套主題的名稱，例如「羅馬・大理石與赭紅」'),
    preset: { type: 'string', enum: Object.keys(THEMES.PRESETS), description: '起點範例（會清除先前的自訂）：' + Object.entries(THEMES.PRESETS).map(([k, p]) => `${k}＝${p.name}`).join('；') },
    colors: { type: 'object', additionalProperties: false, properties: Object.fromEntries(Object.entries(THEMES.COLOR_KEYS).map(([k, d]) => [k, { type: 'string', description: `${d}。#RRGGBB；空字串表示回到起點範例的顏色` }])), description: '配色。background／surface 用淺色（文字是深色）；primary 要夠深（按鈕上的字是 surface 色）；accent 用來畫地圖路線與重點，要在地圖上醒目；map 是地圖底色與手機狀態列色' },
    fonts: { type: 'object', additionalProperties: false, properties: { display: str('標題字體（Google Fonts 英文名稱），例如 Playfair Display、Cinzel、Cormorant Garamond、Noto Serif TC'), display_kind: { type: 'string', enum: ['serif', 'sans'], description: '標題字體是襯線或無襯線（中文字會用對應的宋體或黑體）' }, body: str('內文字體，例如 Inter、DM Sans；system-sans 為裝置字體（最快）'), body_kind: { type: 'string', enum: ['serif', 'sans'] } } },
    map_style: { type: 'string', enum: Object.keys(THEMES.MAP_STYLES), description: '地圖風格起點（換風格會清掉先前的 map 細調）：' + Object.entries(THEMES.MAP_STYLES).map(([k, v]) => `${k}＝${v.name}`).join('、') },
    map: { type: 'object', additionalProperties: false, description: '地圖細調。地圖色調是主題的一部分：每個 preset 都內建搭配好的地圖色調，只改顏色時地圖會自動跟著主題色；要微調才傳這裡，逐項覆蓋，傳空字串表示回到預設。建議依目的地與主題色調整：例如海島用 ocean 或 tint 藍綠、古城用 vintage 或 sepia、極簡主題用 light_gray＋tint accent（雙色）。', properties: {
      base: { type: 'string', enum: Object.keys(THEMES.MAP_BASES), description: '底圖：' + Object.entries(THEMES.MAP_BASES).map(([k, v]) => `${k}＝${v.name}`).join('、') },
      tint: str('染色顏色：優先用主題顏色名稱（primary、accent、map…），地圖會跟著主題配色一起變；也可用 #RRGGBB。保留地圖明暗、換成這個色調'),
      ...Object.fromEntries(Object.entries(THEMES.MAP_ADJUST).map(([k, [d, lo, hi]]) => [k, { type: 'number', minimum: lo, maximum: hi, description: d }])),
    } },
    reset: { type: 'boolean', description: 'true 表示清除所有自訂，只保留 preset' },
  }), ST.setTheme],
  ['get_item', '讀取單一項目的完整內容。', obj({ item_id: str('項目 id') }, ['item_id']), T.getItem, true],
  ['search_itinerary', '用關鍵字搜尋所有項目（名稱、說明、餐點、預訂、雨備）。', obj({ query: str('關鍵字') }, ['query']), T.search, true],
  ['add_place', '在某一天新增景點／餐廳／行程。提供 google_maps_url 會自動帶入名稱與位置；title 可省略。', obj({ day: dayN, title: str('名稱；有 google_maps_url 時可省略'), ...LOC_PROPS, ...ITEM_PROPS }, ['day']), T.addPlace],
  ['update_item', '修改既有項目。只需提供要改的欄位；可改時間、名稱、位置、搬到另一天（day）。', obj({ item_id: str('項目 id'), day: { ...dayN, description: '搬到第幾天' }, title: str('名稱'), ...LOC_PROPS, clear_location: { type: 'boolean', description: 'true 表示移除地圖位置' }, ...ITEM_PROPS }, ['item_id']), T.updateItem],
  ['move_item', '把項目在當天的順序往前或往後移一格。', obj({ item_id: str('項目 id'), direction: { type: 'string', enum: ['up', 'down'] } }, ['item_id', 'direction']), T.moveItem],
  ['delete_item', '刪除項目（可用 undo_change 還原）。', obj({ item_id: str('項目 id') }, ['item_id']), T.deleteItem],
  ['update_day', '修改某一天的日期、標題、區域、摘要、早餐。', obj({ day: dayN, date: str('例如 "12/26 六"'), title: str('標題'), area: str('區域'), summary: str('當天摘要'), breakfast: str('早餐安排') }, ['day']), T.updateDay],
  ['add_day', '在行程最後新增一天。', obj({ date: str('日期'), title: str('標題'), area: str('區域'), summary: str('摘要'), breakfast: str('早餐') }, ['title']), T.addDay],
  ['delete_day', '刪除整天與其所有項目。破壞性操作，執行前請先向使用者確認。', obj({ day: dayN }, ['day']), T.deleteDay],
  ['add_checklist_item', '新增行前待辦。標題開頭寫日期（例如「12/30 Klook 套票」），網站會把它排進那一天、和當天的預訂入口放在一起；沒寫日期的放在「出發前・整趟」。', obj({ title: str('待辦事項'), detail: str('說明') }, ['title']), T.checklistAdd],
  ['update_checklist_item', '修改或勾選行前待辦（done: true 表示已完成）。', obj({ check_id: str('待辦 id'), title: str('標題'), detail: str('說明'), done: { type: 'boolean' } }, ['check_id']), T.checklistUpdate],
  ['delete_checklist_item', '刪除行前待辦。', obj({ check_id: str('待辦 id') }, ['check_id']), T.checklistDelete],
  ['get_note_section', '讀取行前說明區塊（例如簽證與入境）的內容。', obj({ note_id: str('區塊 id') }, ['note_id']), T.getNote, true],
  ['save_note_section', '新增或修改「須知」分頁裡的說明區塊（簽證、入境申報、旅遊稅、海關等）。給 note_id 為修改，不給為新增。paragraphs 每段一個字串，網站會排成步驟清單：可先放一段前言；每個步驟用一行短標題「時間：要做的事」（例如「12/15 前：申請 e-VOA」，28 字內、不加句號），下一段寫內容，每句以「。」結尾會變成一個條列點；最後一段可以只放連結（[名稱](網址)，用｜分隔），會變成參考連結按鈕。國內行程通常不需要，可用 update_trip 的 notes_enabled: false 關掉須知分頁。', obj({ note_id: str('區塊 id'), title: str('標題'), paragraphs: { type: 'array', items: { type: 'string' } } }), T.saveNote],
  ['delete_note_section', '刪除行前說明區塊。', obj({ note_id: str('區塊 id') }, ['note_id']), T.deleteNote],
  ['add_photo', '在項目上新增照片。給 image_url（網路上的圖片網址，或先用 /api/upload 上傳本機圖片取得的網址）或 image_base64（小於約 3MB）。支援 JPEG、PNG、WebP、GIF，上限 8MB。第 1 張會顯示在地圖卡片上。', obj({ item_id: str('項目 id'), image_url: str('圖片網址'), image_base64: str('圖片的 base64（可含 data: 開頭）'), title: str('照片標題，預設用項目名稱'), caption: str('說明，例如「官方空間照」'), credit: str('作者／授權，例如「Wikimedia / CC BY 4.0」'), source: str('來源頁面網址'), position: { type: 'integer', minimum: 1, description: '放在第幾張；預設最後' } }, ['item_id']), T.addPhoto],
  ['update_photo', '修改照片的標題、說明、來源，或調整順序（move_to=1 設為封面）。', obj({ item_id: str('項目 id'), index: { type: 'integer', minimum: 1, description: '第幾張（get_item 的 photos.index）' }, title: str('標題'), caption: str('說明'), credit: str('作者／授權'), source: str('來源網址'), move_to: { type: 'integer', minimum: 1, description: '移到第幾張' } }, ['item_id', 'index']), T.updatePhoto],
  ['remove_photo', '從項目移除一張照片（可用 undo_change 還原）。', obj({ item_id: str('項目 id'), index: { type: 'integer', minimum: 1 } }, ['item_id', 'index']), T.removePhoto],
  ['search', '搜尋行程（天數與項目），回傳 id、標題與網址；再用 fetch 讀完整內容。', obj({ query: str('關鍵字，例如 按摩、恐龍灣、晚餐') }, ['query']), stdSearch, true],
  ['fetch', '讀取 search 找到的一筆完整內容：天數 id 如 d3、項目 id，或 trip（封面與主題）。', obj({ id: str('search 結果的 id') }, ['id']), stdFetch, true],
  ['get_history', '列出最近的修改紀錄（含 history_id，可用來還原）。', obj({ limit: { type: 'integer', minimum: 1, maximum: 100 } }), T.getHistory, true],
  ['undo_change', '還原一筆修改紀錄：撤銷新增、還原修改前內容，或救回已刪除的資料。', obj({ history_id: { type: 'integer' } }, ['history_id']), T.undoChange],
];
const INSTRUCTIONS = `這是 Ben & Irene 峇里島跨年行程（${T.SITE}）的編輯介面。行程按天排列，每天有多個項目（景點、餐廳、交通等）。
先用 get_itinerary 了解現況並取得 id，再用 add_place / update_item 等工具修改。新增地點時優先使用 Google 地圖連結。
網站第一頁是封面＋行前資料：封面與行前說明用 update_trip，待辦用 *_checklist_item，說明區塊用 save_note_section；整站配色、字體、地圖風格用 set_theme。
規劃新的旅程（例如「幫我規劃羅馬 7 天」）時，網站要跟著目的地變：用 update_trip 換標題、日期、介紹與一張有代表性且有授權的封面照片，再用 set_theme 依目的地文化與封面照片的色調自己設計配色、字體與地圖風格。取代現有行程前先跟使用者確認。
文字欄位用純文字；連結寫成 [文字](https://網址)。所有修改都會即時同步到網站並留下紀錄，可用 get_history 與 undo_change 還原。
刪除整天等破壞性操作前，請先向使用者確認。完整規則與「使用者問能做什麼」的回答方式見 ${T.SITE}/ai 。`;

const TITLES = {
  get_itinerary: '查看行程', get_trip: '查看封面與風格', update_trip: '修改封面', set_theme: '設計網站風格', get_item: '查看項目', search_itinerary: '搜尋行程',
  add_place: '新增景點', update_item: '修改項目', move_item: '調整順序', delete_item: '刪除項目', update_day: '修改這天', add_day: '新增一天', delete_day: '刪除一天',
  add_checklist_item: '新增待辦', update_checklist_item: '修改待辦', delete_checklist_item: '刪除待辦', get_note_section: '查看說明區塊', save_note_section: '儲存說明區塊',
  delete_note_section: '刪除說明區塊', add_photo: '新增照片', update_photo: '修改照片', remove_photo: '移除照片', search: '搜尋', fetch: '讀取內容', get_history: '修改紀錄', undo_change: '還原修改',
};
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ICON = `${T.SITE}/icons/icon-192.png`;
const toolList = () => TOOLS.map(([name, description, inputSchema, , ro]) => ({
  name, title: TITLES[name] || name, description, inputSchema,
  annotations: { title: TITLES[name] || name, readOnlyHint: !!ro, destructiveHint: /^(delete_|remove_)/.test(name), idempotentHint: !!ro, openWorldHint: false },
}));
// 執行工具（MCP 與 /api/tools REST 共用）；修改後同步重算路線
async function callTool(name, args) {
  const t = TOOLS.find(t => t[0] === name);
  if (!t) { const e = new Error(`未知的工具：${name}`); e.code = 404; throw e; }
  const result = await t[3](args || {});
  if (!t[4]) { try { const r = await syncRoutes(); if (r.length) result.route_updated = true; } catch (e) { /* 路線失敗不影響修改本身 */ } }
  return result;
}

async function handle(msg) {
  const { id, method, params = {} } = msg;
  const ok = result => ({ jsonrpc: '2.0', id, result });
  if (method === 'initialize') return ok({ protocolVersion: VERSIONS.includes(params.protocolVersion) ? params.protocolVersion : VERSIONS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'bali-trip', title: 'Ben & Irene 峇里島行程', version: '1.1.0', websiteUrl: T.SITE, icons: [{ src: ICON, mimeType: 'image/png', sizes: ['192x192'] }] }, instructions: INSTRUCTIONS });
  if (method === 'ping') return ok({});
  if (method === 'tools/list') return ok({ tools: toolList() });
  if (method === 'resources/list') return ok({ resources: [] });
  if (method === 'resources/templates/list') return ok({ resourceTemplates: [] });
  if (method === 'prompts/list') return ok({ prompts: [] });
  if (method === 'tools/call') {
    if (!TOOLS.some(t => t[0] === params.name)) return { jsonrpc: '2.0', id, error: { code: -32602, message: `未知的工具：${params.name}` } };
    try {
      const result = await callTool(params.name, params.arguments);
      return ok({ content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], structuredContent: result });
    }
    catch (e) { return ok({ content: [{ type: 'text', text: `錯誤：${e.message || e}` }], isError: true }); }
  }
  if (id === undefined) return null; // notification
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    if ((req.headers.accept || '').includes('text/event-stream')) return res.status(405).json({ error: 'SSE stream not supported; use POST' });
    if (req.query.tool) { // 只讀工具可用 GET，方便只能讀網頁的 AI
      const t = TOOLS.find(t => t[0] === req.query.tool && t[4]);
      if (!t) return res.status(400).json({ error: '只有讀取類工具可用 GET；修改請用 POST（見 /llms.txt）' });
      const { tool, ...args } = req.query;
      for (const k of ['day', 'limit']) if (args[k] !== undefined) args[k] = Number(args[k]);
      try { return res.status(200).json(await t[3](args)); } catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
    }
    return res.status(200).json({ name: 'bali-trip MCP server', transport: 'streamable-http', endpoint: `${T.SITE}/api/mcp`, docs: `${T.SITE}/llms.txt`, tools: TOOLS.map(t => t[0]) });
  }
  if (req.method === 'DELETE') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  const batch = Array.isArray(body);
  const out = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
  if (!out.length) return res.status(202).end();
  res.status(200).json(batch ? out : out[0]);
};

module.exports.TOOLS = TOOLS;
module.exports.TITLES = TITLES;
module.exports.callTool = callTool;
module.exports.INSTRUCTIONS = INSTRUCTIONS;
