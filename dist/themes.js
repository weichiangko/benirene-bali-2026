/* 網站主題：配色、字體、地圖風格。網頁（window.TRIP_THEMES）與 MCP 伺服器（require）共用同一份。
 * 主題存在資料庫 trip.theme：{ preset, name, colors:{…}, fonts:{…}, map_style, map:{ base, saturation, …, tint } }，只需寫要覆蓋的項目。 */
(function (root) {
  // 每個顏色欄位的用途（給 AI 與編輯表單看）
  var COLOR_KEYS = {
    background: '整體背景',
    surface: '卡片、面板底色',
    text: '主要文字',
    muted: '次要文字',
    primary: '主色：按鈕、目前選取的日期',
    primary_dark: '主色的深色版',
    accent: '強調色：路線、標題小字、地點編號',
    accent_dark: '強調色的深色版：時間、類型文字',
    border: '框線',
    soft: '淡色底（標籤、hover）',
    map: '地圖區背景、手機狀態列',
    photo_bg: '照片載入前的底色',
    warn_bg: '提醒底色',
    warn: '提醒文字',
    dash: '交通項目的虛線框',
    handle: '手機面板拖曳把手',
  };
  var CSS_VAR = {
    background: '--bg', surface: '--paper', text: '--ink', muted: '--muted', primary: '--green', primary_dark: '--green-d',
    accent: '--gold', accent_dark: '--brown', border: '--line', soft: '--soft', map: '--map', photo_bg: '--ph',
    warn_bg: '--warnbg', warn: '--warn', dash: '--dash', handle: '--handle',
  };
  // 地圖：底圖（Esri 圖磚）＋色調。map_style 是一組起點，map 物件可逐項微調。
  var ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
  var MAP_BASES = {
    street: { name: '街道圖（預設）', layers: ['World_Street_Map'], max: 16 },
    topo: { name: '地形圖（等高線、山地）', layers: ['World_Topo_Map'], max: 16 },
    light_gray: { name: '淺灰極簡（適合搭配強烈主題色）', layers: ['Canvas/World_Light_Gray_Base'], labels: 'Canvas/World_Light_Gray_Reference', max: 16 },
    dark_gray: { name: '深灰夜間', layers: ['Canvas/World_Dark_Gray_Base'], labels: 'Canvas/World_Dark_Gray_Reference', max: 16 },
    satellite: { name: '衛星空照', layers: ['World_Imagery'], labels: 'Reference/World_Boundaries_and_Places', max: 18 },
    ocean: { name: '海洋（海島、潛水行程）', layers: ['Ocean/World_Ocean_Base'], labels: 'Ocean/World_Ocean_Reference', max: 13 },
  };
  // 色調參數（百分比／角度）；tint 是蓋在底圖上的一層顏色，tint_strength 為濃度
  var MAP_ADJUST = {
    saturation: ['飽和度 %，100 為原色，0 為黑白', 0, 200, 100],
    brightness: ['亮度 %，100 為原始', 50, 150, 100],
    contrast: ['對比 %，100 為原始', 50, 150, 100],
    hue_rotate: ['色相旋轉（度），-180～180', -180, 180, 0],
    sepia: ['懷舊泛黃 %', 0, 100, 0],
    grayscale: ['黑白程度 %', 0, 100, 0],
    tint_strength: ['染色濃度 %（搭配 tint 顏色）', 0, 80, 0],
    label_opacity: ['地名文字不透明度 %（淺灰、深灰、衛星、海洋底圖才有獨立地名層）', 0, 100, 100],
    label_warmth: ['地名文字暖色 %：0 為原本灰色，100 為金棕色（只作用在獨立地名層）', 0, 100, 0],
  };
  var MAP_STYLES = {
    natural: { name: '原色', base: 'street' },
    muted: { name: '低飽和', base: 'street', saturation: 45, brightness: 103 },
    mono: { name: '黑白', base: 'street', grayscale: 100, contrast: 92, brightness: 106 },
    warm: { name: '暖色', base: 'street', sepia: 28, saturation: 85 },
    cool: { name: '冷色', base: 'street', saturation: 70, tint: '#4f86b0', tint_strength: 18 },
    vintage: { name: '復古泛黃', base: 'street', sepia: 50, saturation: 70, contrast: 92, brightness: 102 },
    pastel: { name: '粉彩柔和', base: 'street', saturation: 60, brightness: 110, contrast: 85 },
    duotone: { name: '主題雙色（用主題強調色染色）', base: 'light_gray', grayscale: 100, tint: 'accent', tint_strength: 30 },
    ink: { name: '水墨淺灰', base: 'light_gray', grayscale: 100, contrast: 108 },
    night: { name: '夜間深色', base: 'dark_gray' },
    terrain: { name: '地形', base: 'topo', saturation: 85 },
    satellite: { name: '衛星', base: 'satellite' },
    ocean: { name: '海洋', base: 'ocean' },
  };
  // 中文字的備援字體：西文字體沒有中文字時會用這些
  var FALLBACK = {
    serif: "'Songti TC','Noto Serif TC','PMingLiU',serif",
    sans: "-apple-system,system-ui,'PingFang TC','Noto Sans TC','Microsoft JhengHei',sans-serif",
  };
  var SYSTEM = { 'system-serif': "Georgia,'Songti TC','Noto Serif TC',serif", 'system-sans': FALLBACK.sans };

  var PRESETS = {
    bali: {
      name: '峇里島・熱帶文化', description: '森林綠＋陶土棕，古典襯線標題，溫潤的米色紙感',
      colors: { background: '#f5f2ea', surface: '#fffdf8', text: '#223c35', muted: '#5d6c65', primary: '#214f43', primary_dark: '#163a31', accent: '#a76c3f', accent_dark: '#8a5530', border: '#dce1d6', soft: '#e8eee5', map: '#e4eadd', photo_bg: '#dfe6d8', warn_bg: '#f5e8da', warn: '#7d4a24', dash: '#c9b39c', handle: '#b9c1b4' },
      fonts: { display: 'Cormorant Garamond', display_kind: 'serif', body: 'system-sans', body_kind: 'sans' },
      map_style: 'natural',
    },
    british: {
      name: '英倫・紅黑白', description: '郵筒紅＋墨黑＋白，高對比的英式襯線標題，黑白地圖',
      colors: { background: '#f6f4ef', surface: '#ffffff', text: '#141414', muted: '#5b5b5b', primary: '#141414', primary_dark: '#000000', accent: '#c8102e', accent_dark: '#9b0d23', border: '#e1ddd5', soft: '#efece5', map: '#ecebe7', photo_bg: '#e4e2dc', warn_bg: '#f8e4e6', warn: '#8e0b20', dash: '#c9c2b8', handle: '#bdb8b0' },
      fonts: { display: 'Playfair Display', display_kind: 'serif', body: 'Libre Franklin', body_kind: 'sans' },
      map_style: 'mono',
    },
    kyoto: {
      name: '京都・藍與朱', description: '藍染深藍＋鳥居朱紅，明朝體標題，和紙底色',
      colors: { background: '#f3efe6', surface: '#fbf8f1', text: '#1f2433', muted: '#5f6372', primary: '#23305a', primary_dark: '#161f3d', accent: '#c0392b', accent_dark: '#8f2a1f', border: '#ddd6c8', soft: '#ebe5d8', map: '#ece6d9', photo_bg: '#e3dccd', warn_bg: '#f6e3dc', warn: '#8f2a1f', dash: '#c8b9a3', handle: '#bdb5a6' },
      fonts: { display: 'Shippori Mincho', display_kind: 'serif', body: 'system-sans', body_kind: 'sans' },
      map_style: 'muted',
    },
    nordic: {
      name: '北歐・極簡', description: '冷灰白＋深藍灰，無襯線字體，乾淨留白',
      colors: { background: '#f3f4f3', surface: '#ffffff', text: '#1d2327', muted: '#66717a', primary: '#2f4858', primary_dark: '#1f323e', accent: '#b46a3a', accent_dark: '#8f5530', border: '#dfe3e4', soft: '#eaeeef', map: '#e9eced', photo_bg: '#e1e5e6', warn_bg: '#f6ebe2', warn: '#8a5532', dash: '#c3cbcf', handle: '#bcc4c8' },
      fonts: { display: 'Inter Tight', display_kind: 'sans', body: 'Inter', body_kind: 'sans' },
      map_style: 'muted',
    },
    mediterranean: {
      name: '地中海・藍白陶土', description: '愛琴海藍＋陶土橘，現代襯線標題，陽光白',
      colors: { background: '#f7f1e8', surface: '#fffaf2', text: '#2a2622', muted: '#6b625a', primary: '#1f4e79', primary_dark: '#143557', accent: '#c96a3f', accent_dark: '#9a4d2b', border: '#e6dccd', soft: '#f0e7da', map: '#efe7da', photo_bg: '#e8dfd1', warn_bg: '#f7e4d8', warn: '#8a4325', dash: '#d3bfa6', handle: '#c8bba8' },
      fonts: { display: 'DM Serif Display', display_kind: 'serif', body: 'DM Sans', body_kind: 'sans' },
      map_style: 'warm',
    },
  };

  var HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  var FONT = /^[A-Za-z0-9 \-]{2,48}$/;

  // 合併預設主題與自訂覆蓋，回傳完整主題
  function resolve(theme) {
    theme = theme || {};
    var base = PRESETS[theme.preset] || PRESETS.bali;
    var colors = {}, k;
    for (k in COLOR_KEYS) colors[k] = (theme.colors && HEX.test(theme.colors[k] || '')) ? theme.colors[k] : base.colors[k];
    var f = theme.fonts || {}, bf = base.fonts;
    var fonts = {
      display: FONT.test(f.display || '') ? f.display : bf.display,
      display_kind: f.display_kind === 'sans' || f.display_kind === 'serif' ? f.display_kind : (FONT.test(f.display || '') ? 'serif' : bf.display_kind),
      body: FONT.test(f.body || '') ? f.body : bf.body,
      body_kind: f.body_kind === 'serif' || f.body_kind === 'sans' ? f.body_kind : (FONT.test(f.body || '') ? 'sans' : bf.body_kind),
    };
    var style = MAP_STYLES[theme.map_style] ? theme.map_style : base.map_style, st = MAP_STYLES[style], mo = theme.map || {}, m = { style: style };
    m.base = MAP_BASES[mo.base] ? mo.base : st.base;
    for (k in MAP_ADJUST) { var a = MAP_ADJUST[k], v = mo[k] != null ? +mo[k] : (st[k] != null ? st[k] : a[3]); m[k] = isNaN(v) ? a[3] : Math.max(a[1], Math.min(a[2], v)); }
    var tint = mo.tint != null ? mo.tint : st.tint || '';
    if (tint && COLOR_KEYS[tint]) tint = colors[tint]; // 可用主題顏色名稱，例如 accent
    m.tint = HEX.test(tint) ? tint : '';
    return { preset: PRESETS[theme.preset] ? theme.preset : 'bali', name: theme.name || base.name, colors: colors, fonts: fonts, map_style: style, map: m };
  }
  function stack(family, kind) { return SYSTEM[family] || ("'" + family + "'," + FALLBACK[kind === 'serif' ? 'serif' : 'sans']); }
  // Google Fonts 網址（系統字體不需載入）
  function fontsUrl(t) {
    var fam = [];
    [[t.fonts.display, 'display'], [t.fonts.body, 'body']].forEach(function (p) {
      if (!SYSTEM[p[0]] && fam.indexOf(p[0]) < 0) fam.push(p[0]);
    });
    // iOS 沒有內建中文宋體：襯線標題補上 Noto Serif TC（Mac 會先用內建的宋體，不會下載）
    if (t.fonts.display_kind === 'serif' && fam.indexOf('Noto Serif TC') < 0 && t.fonts.display !== 'Noto Serif TC') fam.push('Noto Serif TC');
    if (!fam.length) return '';
    return 'https://fonts.googleapis.com/css2?' + fam.map(function (n, i) {
      return 'family=' + encodeURIComponent(n).replace(/%20/g, '+') + ':wght@400;500;600;700';
    }).join('&') + '&display=swap';
  }
  // 驗證 AI／表單送來的主題，回傳要存的物件或丟出錯誤
  function clean(input, current) {
    input = input || {};
    var out = input.reset ? {} : JSON.parse(JSON.stringify(current || {}));
    if (input.preset != null) {
      if (!PRESETS[input.preset]) throw new Error('沒有這個主題：' + input.preset + '。可用：' + Object.keys(PRESETS).join('、'));
      out = { preset: input.preset };
    }
    if (input.colors) {
      out.colors = out.colors || {};
      for (var k in input.colors) {
        if (!COLOR_KEYS[k]) throw new Error('沒有這個顏色欄位：' + k + '。可用：' + Object.keys(COLOR_KEYS).join('、'));
        var v = input.colors[k];
        if (v === null || v === '') { delete out.colors[k]; continue; }
        if (!HEX.test(v)) throw new Error(k + ' 必須是 #RRGGBB 色碼');
        out.colors[k] = v.toLowerCase();
      }
    }
    if (input.fonts) {
      out.fonts = out.fonts || {};
      ['display', 'body'].forEach(function (k) {
        var v = input.fonts[k];
        if (v === undefined) return;
        if (v === null || v === '') { delete out.fonts[k]; return; }
        if (!SYSTEM[v] && !FONT.test(v)) throw new Error('字體名稱只能是 Google Fonts 的英文名稱，例如 Playfair Display，或 system-serif／system-sans');
        out.fonts[k] = v;
      });
      ['display_kind', 'body_kind'].forEach(function (k) {
        var v = input.fonts[k];
        if (v === undefined) return;
        if (v !== 'serif' && v !== 'sans') throw new Error(k + ' 只能是 serif 或 sans');
        out.fonts[k] = v;
      });
    }
    if (input.map_style != null) {
      if (!MAP_STYLES[input.map_style]) throw new Error('map_style 只能是：' + Object.keys(MAP_STYLES).join('、'));
      out.map_style = input.map_style;
      if (!input.map) delete out.map; // 換風格時清掉先前的細調
    }
    if (input.map) {
      out.map = out.map || {};
      for (var mk in input.map) {
        var mv = input.map[mk];
        if (mv === null || mv === '') { delete out.map[mk]; continue; }
        if (mk === 'base') { if (!MAP_BASES[mv]) throw new Error('map.base 只能是：' + Object.keys(MAP_BASES).join('、')); out.map.base = mv; }
        else if (mk === 'tint') { if (!HEX.test(mv) && !COLOR_KEYS[mv]) throw new Error('map.tint 要是 #RRGGBB 或主題顏色名稱（例如 accent、primary）'); out.map.tint = mv; }
        else if (MAP_ADJUST[mk]) { var n = Number(mv), r = MAP_ADJUST[mk]; if (isNaN(n) || n < r[1] || n > r[2]) throw new Error('map.' + mk + ' 要在 ' + r[1] + '～' + r[2] + ' 之間'); out.map[mk] = n; }
        else throw new Error('沒有這個地圖設定：' + mk + '。可用：base、tint、' + Object.keys(MAP_ADJUST).join('、'));
      }
      if (!Object.keys(out.map).length) delete out.map;
    }
    if (input.name !== undefined) {
      var nm = String(input.name || '').trim();
      if (nm.length > 40) throw new Error('name 最多 40 個字');
      if (nm) out.name = nm; else delete out.name;
    }
    if (!out.preset) out.preset = (current && current.preset) || 'bali';
    return out;
  }

  // WCAG 對比度，給 AI 自訂配色時檢查可讀性
  function lum(hex) {
    var h = hex.replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&');
    return [0, 2, 4].map(function (i) { var c = parseInt(h.substr(i, 2), 16) / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
      .reduce(function (a, c, i) { return a + c * [0.2126, 0.7152, 0.0722][i]; }, 0);
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function check(t) {
    var c = t.colors, w = [];
    [['text', 'background', 4.5], ['text', 'surface', 4.5], ['muted', 'surface', 4.5], ['surface', 'primary', 4.5, '按鈕文字（surface）在主色上'], ['accent_dark', 'surface', 4.5], ['accent', 'surface', 3], ['warn', 'warn_bg', 4.5]]
      .forEach(function (p) { var r = contrast(c[p[0]], c[p[1]]); if (r < p[2]) w.push((p[3] || (p[0] + ' 在 ' + p[1] + ' 上')) + '對比 ' + r.toFixed(1) + '，建議至少 ' + p[2]); });
    return w;
  }

  // 地圖的 CSS filter 與圖磚網址（網頁用）
  function mapFilter(m) {
    var f = [];
    if (m.grayscale) f.push('grayscale(' + m.grayscale + '%)');
    if (m.sepia) f.push('sepia(' + m.sepia + '%)');
    if (m.saturation !== 100) f.push('saturate(' + m.saturation + '%)');
    if (m.hue_rotate) f.push('hue-rotate(' + m.hue_rotate + 'deg)');
    if (m.brightness !== 100) f.push('brightness(' + m.brightness + '%)');
    if (m.contrast !== 100) f.push('contrast(' + m.contrast + '%)');
    return f.join(' ') || 'none';
  }
  function tileLayers(m) {
    var b = MAP_BASES[m.base] || MAP_BASES.street, u = function (l) { return ESRI + l + '/MapServer/tile/{z}/{y}/{x}'; };
    return { base: b.layers.map(u), labels: b.labels ? u(b.labels) : '', max: b.max };
  }
  var api = { PRESETS: PRESETS, COLOR_KEYS: COLOR_KEYS, CSS_VAR: CSS_VAR, MAP_STYLES: MAP_STYLES, MAP_BASES: MAP_BASES, MAP_ADJUST: MAP_ADJUST, mapFilter: mapFilter, tileLayers: tileLayers, resolve: resolve, stack: stack, fontsUrl: fontsUrl, clean: clean, check: check, contrast: contrast };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TRIP_THEMES = api;
})(this);
