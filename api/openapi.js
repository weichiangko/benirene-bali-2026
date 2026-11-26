// OpenAPI 3.1 說明檔：在 ChatGPT「建立 GPT → 動作 → 從網址匯入」貼上 /openapi.json 即可。
const { TOOLS, TITLES } = require('./mcp');
const { SITE, MCP_NAME } = require('./_lib/env');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

module.exports = function handler(req, res) {
  const paths = {};
  for (const [name, description, schema, , ro] of TOOLS) {
    paths[`/api/tools/${name}`] = {
      post: {
        operationId: name,
        summary: TITLES[name] || name,
        description: clip(description, 300), // GPT 動作的描述上限 300 字
        ...(ro ? {} : { 'x-openai-isConsequential': /^(delete_|remove_|undo_)/.test(name) }),
        requestBody: { required: true, content: { 'application/json': { schema: { ...schema, properties: schema.properties || {} } } } },
        responses: {
          200: { description: '結果', content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } } },
          400: { description: '錯誤（訊息在 error）', content: { 'application/json': { schema: { type: 'object', properties: { error: { type: 'string' } } } } } },
        },
      },
    };
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache');
  res.status(200).json({
    openapi: '3.1.0',
    info: { title: `${MCP_NAME} 旅行行程`, version: '1.2.0', description: `讀取與編輯 ${SITE} 的旅行行程、封面與網站風格。完整規則見 ${SITE}/ai` },
    servers: [{ url: SITE }],
    paths,
    components: { schemas: {} },
  });
};
