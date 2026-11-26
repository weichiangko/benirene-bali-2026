// 依部署環境產生的檔案：/config.js、/manifest.webmanifest、/ai（llms.txt）、/install.sh、/duplicate。
// 範本在 docs/，{{SITE}} 等變數換成這個網站自己的網址與旅程名稱，同一份程式碼部署到哪裡都正確。
const fs = require('fs');
const path = require('path');
const { SITE, SB_URL, SB_KEY, MCP_NAME, TEMPLATE_REPO } = require('./_lib/env');
const ST = require('./_lib/settings');

const DOCS = path.join(__dirname, '..', 'docs');
const FILES = {
  llms: ['llms.txt', 'text/plain; charset=utf-8'],
  install: ['install.sh', 'text/plain; charset=utf-8'],
  duplicate: ['duplicate.md', 'text/plain; charset=utf-8'],
  manifest: ['manifest.webmanifest', 'application/manifest+json'],
};

async function vars() {
  let t = {};
  try { t = await ST.tripBrief(); } catch (e) { /* 資料庫還沒設定好時用通用名稱 */ }
  const short = t.title || '旅行行程';
  const md = d => (d ? `${+d.slice(0, 4)}/${+d.slice(5, 7)}/${+d.slice(8, 10)}` : '');
  return {
    SITE, NAME: MCP_NAME, REPO: TEMPLATE_REPO, SHORT: short,
    LABEL: [t.travelers, short].filter(Boolean).join(' '),
    DATES: t.start_date ? `${md(t.start_date)} – ${md(t.end_date) || '?'}` : '日期未定',
    THEME: (t.theme && t.theme.resolved && t.theme.resolved.colors && t.theme.resolved.colors.background) || '#e4eadd',
  };
}
const fill = (s, v, json) => s.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? (json ? JSON.stringify(String(v[k])).slice(1, -1) : v[k]) : m));

module.exports = async function handler(req, res) {
  const f = String(req.query.f || '');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, max-age=0');
  if (f === 'config') {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return res.status(200).send(`window.BALI_CONFIG=${JSON.stringify({ url: SB_URL, key: SB_KEY, site: SITE, mcp: MCP_NAME })};\n`);
  }
  const file = FILES[f];
  if (!file) return res.status(404).send('not found');
  const text = fs.readFileSync(path.join(DOCS, file[0]), 'utf8');
  res.setHeader('Content-Type', file[1]);
  const v = await vars();
  // install.sh 會被 curl | sh 執行：旅程名稱是任何人都能改的內容，拿掉所有 shell 特殊字元
  if (f === 'install') for (const k of ['LABEL', 'SHORT', 'DATES']) v[k] = String(v[k]).replace(/["'`$\\!;|<>(){}\[\]\n\r]/g, '');
  return res.status(200).send(fill(text, v, f === 'manifest'));
};
