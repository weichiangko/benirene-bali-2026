// 網站圖示：依主題自動產生，或用使用者上傳的圖片（裁成正方形）。SVG 直接回傳，PNG 用 resvg 轉。
const THEMES = require('../../dist/themes.js');

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = c => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : null);

// 自動圖示：主色滿版底（maskable，主體在中間 60% 內）＋地圖標記＋強調色路線。不用文字，避免字型問題。
function autoSvg(theme) {
  const c = THEMES.resolve(theme || {}).colors || {};
  const bg = hex(c.primary) || '#2c6353', fg = hex(c.surface) || '#fffdf8', ac = hex(c.accent) || '#c47a45';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="${bg}"/>
<path d="M138 402c30 4 56-2 78-10s30-14 40-14" fill="none" stroke="${ac}" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 24"/>
<path d="M256 136c-50 0-90 39-90 88 0 64 90 154 90 154s90-90 90-154c0-49-40-88-90-88z" fill="${fg}"/>
<circle cx="256" cy="224" r="34" fill="${ac}"/>
</svg>`;
}

// 上傳的圖片：嵌進 SVG，置中裁成正方形
async function imageSvg(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`讀不到圖示圖片 ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const type = r.headers.get('content-type') || 'image/png';
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" width="512" height="512">
<rect width="512" height="512" fill="#fff"/>
<image width="512" height="512" preserveAspectRatio="xMidYMid slice" href="data:${esc(type)};base64,${buf.toString('base64')}"/>
</svg>`;
}

async function iconSvg(trip) {
  if (trip && trip.icon_image) {
    try { return await imageSvg(trip.icon_image); } catch (e) { /* 圖片壞掉時退回自動圖示 */ }
  }
  return autoSvg(trip && trip.theme);
}

function toPng(svg, size) {
  const { Resvg } = require('@resvg/resvg-js');
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render().asPng();
}

module.exports = { iconSvg, autoSvg, toPng };
