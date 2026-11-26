// duplicate_site：回傳把這個網站複製到使用者自己 Vercel 帳號的步驟。本身不改任何資料。
const { SITE, TEMPLATE_REPO } = require('./env');

const QUESTIONS = [
  { key: 'title', ask: '這趟旅程叫什麼？（例如「羅馬七日」）' },
  { key: 'destination', ask: '目的地是哪裡？（例如 Rome, Italy）' },
  { key: 'start_date', ask: '出發日期？（YYYY-MM-DD，可以之後再補）', optional: true },
  { key: 'end_date', ask: '回程日期？（YYYY-MM-DD，可以之後再補）', optional: true },
  { key: 'travelers', ask: '跟誰一起去？（顯示在封面）', optional: true },
  { key: 'start_from', ask: '要複製這個網站現在的行程當範本再改，還是從空白開始？（copy / blank）' },
  { key: 'project_name', ask: '網址想用什麼名字？（英文小寫與 -，例如 rome-2027，會變成 rome-2027.vercel.app）' },
];

const slug = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 52);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const sh = s => `'${String(s).replace(/'/g, `'\\''`)}'`;

// Vercel 一鍵部署按鈕（給不能執行指令的聊天介面）。Supabase 的 Vercel 整合 id 取自 Supabase 官方範本。
const SUPABASE_INTEGRATION = process.env.SUPABASE_INTEGRATION_ID || 'oac_VqOgBHqhEoFTPzGkPd7L0iH6';
function deployButton(name) {
  const q = new URLSearchParams({ 'repository-url': TEMPLATE_REPO, 'integration-ids': SUPABASE_INTEGRATION });
  if (name) { q.set('project-name', name); q.set('repository-name', name); }
  return `https://vercel.com/new/clone?${q}`;
}

async function duplicateSite(a = {}) {
  const missing = QUESTIONS.filter(q => !q.optional && !String(a[q.key] || '').trim());
  if (missing.length) {
    return {
      next: 'ask_user',
      say: '先跟使用者確認下面幾件事（一次問完），等他回答後再帶著答案呼叫一次 duplicate_site。不要自己編答案或用範例值；選填的題目使用者說跳過才跳過。',
      questions: QUESTIONS.map(q => ({ ...q, answered: !!String(a[q.key] || '').trim() })),
      what_happens: '會在使用者自己的 Vercel 帳號建立一個新網站和一個新的 Supabase 資料庫（Vercel Marketplace，免費方案即可），這個網站不會被修改。使用者只需要在瀏覽器登入 Vercel。',
    };
  }
  const name = slug(a.project_name);
  if (name.length < 3) throw new Error('project_name 至少 3 個字元，只能用英文小寫、數字與 -');
  for (const k of ['start_date', 'end_date']) if (a[k] && !DATE.test(a[k])) throw new Error(`${k} 格式要是 YYYY-MM-DD`);
  const from = a.start_from === 'blank' ? 'blank' : 'copy';
  const trip = Object.fromEntries(['title', 'travelers', 'destination', 'start_date', 'end_date'].filter(k => a[k]).map(k => [k, String(a[k]).trim()]));
  const v = 'npx -y vercel@latest';
  const env = [['SEED', from === 'copy' ? 'copy' : 'blank'], ...(from === 'copy' ? [['SEED_FROM', SITE]] : []), ['MCP_NAME', name]];
  const commands = [
    `git clone --depth 1 ${TEMPLATE_REPO}.git ${name} && cd ${name} && rm -rf .git .vercel`,
    `${v} whoami || ${v} login`,
    `${v} whoami && ${v} teams ls   # 把帳號與團隊列給使用者，等他確認要部署到哪一個（見 guide 第 3b 步），團隊 slug 填進下面的 <團隊>`,
    `${v} --scope <團隊> link --yes --project ${name}`,
    `${v} --scope <團隊> integration add supabase --name ${name}-db`,
    ...env.map(([k, val]) => `printf %s ${sh(val)} | ${v} --scope <團隊> env add ${k} production`),
    `${v} --scope <團隊> deploy --prod --yes`,
    `curl -fsSL <部署後的網址>/install.sh | sh   # 把新網站的 MCP 接到這台電腦的 AI 工具（必做）`,
    `open <部署後的網址>/   # Linux: xdg-open、Windows: start`,
  ];
  return {
    next: 'deploy',
    project_name: name,
    expected_url: `https://${name}.vercel.app`,
    start_from: from,
    // 能在使用者電腦執行指令的 AI（Claude Code、Claude 桌面版的 Code、Codex、Cursor…）
    if_you_can_run_commands: {
      guide: `${SITE}/duplicate`,
      say: `先完整閱讀 ${SITE}/duplicate，再依序執行下面的指令；每一步看輸出，失敗時照說明處理，不要跳過。登入後一定要把 Vercel CLI 的帳號與團隊列給使用者確認要部署到哪裡；CLI 帳號不對時不要登出，改用 --global-config 另外登入。`,
      commands,
      after_deploy: {
        mcp: `<部署後的網址>/mcp`,
        then: [
          '上面最後兩個指令一定要執行：install.sh 把新網站的 MCP 接到使用者的 AI 工具，open 打開網站；工具還沒出現前用 POST <部署後的網址>/mcp 呼叫',
          `用新網站的 MCP 呼叫 update_trip：${JSON.stringify(trip)}${from === 'blank' ? '，並依目的地換一張有授權的封面照片' : ''}`,
          '用 set_theme 依目的地設計配色、字體與地圖風格',
          '每一天都要有照片：替每天的代表景點用 add_photo 加有授權的照片（例如 Wikimedia Commons，填 credit 與 source），封面的每日卡片才不會空白；copy 的話把和新目的地無關的範本照片換掉。最後用 get_itinerary 檢查每天都有照片，再用 update_trip 選封面照片',
          from === 'copy' ? '問使用者要保留、修改或刪除哪些從範本複製來的天數與景點' : '問使用者要不要現在就開始排每天的行程',
          `告訴使用者新網址、MCP 接到了哪些 AI 工具；分享給旅伴用這句：閱讀 <部署後的網址>/ai ，幫我連上我們的行程並打開網站`,
        ],
      },
    },
    // 只能聊天、不能執行指令的 AI（Claude 網頁／桌面聊天、ChatGPT）
    if_you_cannot_run_commands: {
      deploy_button: deployButton(name),
      say: '把 deploy_button 連結給使用者：登入 Vercel → 照畫面建立 Supabase → 按 Deploy。完成後請使用者把新網址貼回來，你再用新網址的 /mcp（或 /api/mcp?tool=… 與 POST /mcp）幫他改封面、主題與行程。',
      note: '用按鈕部署的網站會先帶入範本行程（seed.json）。',
    },
  };
}

module.exports = { duplicateSite, deployButton, QUESTIONS };
