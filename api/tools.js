// 一般 HTTP（REST）版的同一組工具：給 ChatGPT 自訂 GPT 的「動作（Actions）」等不支援 MCP 的地方使用。
// POST /api/tools/<工具名稱>，body 為參數 JSON；GET 只開放讀取類工具。
const { TOOLS, callTool } = require('./mcp');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const name = String(req.query.name || '');
  const t = TOOLS.find(t => t[0] === name);
  if (!t) return res.status(404).json({ error: `沒有這個工具：${name}`, tools: TOOLS.map(t => t[0]) });
  let args = {};
  if (req.method === 'POST') {
    args = req.body;
    if (typeof args === 'string') { try { args = JSON.parse(args || '{}'); } catch { return res.status(400).json({ error: '請傳 JSON' }); } }
    args = args || {};
  } else if (req.method === 'GET') {
    if (!t[4]) return res.status(405).json({ error: '修改類工具請用 POST' });
    const { name: _, ...q } = req.query;
    for (const k of ['day', 'limit']) if (q[k] !== undefined) q[k] = Number(q[k]);
    args = q;
  } else return res.status(405).end();
  try { return res.status(200).json(await callTool(name, args)); }
  catch (e) { return res.status(e.code === 404 ? 404 : 400).json({ error: String(e.message || e) }); }
};
