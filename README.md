# Ben & Irene 峇里島跨年行程

https://benirene-bali-2026.vercel.app

可離線使用的旅行行程網站（PWA）：封面＋行前資料、每日路線地圖、景點照片相簿，內容存在 Supabase，網站上或任何 AI 都能直接編輯。

## 結構

- `dist/`：靜態網站（無建置步驟）。`app.js` 主程式、`themes.js` 主題（配色、字體、地圖底圖與色調）、`sw.js` 離線快取、`llms.txt` 給 AI 的說明（也在 `/ai`）。
- `api/`：Vercel 函式。
  - `mcp.js`：MCP 伺服器（`/mcp`，Streamable HTTP，免登入），Claude 聊天、ChatGPT、Claude Code、Codex 等都能接。
  - `tools.js`、`openapi.js`：同一組工具的 REST 版（`/api/tools/<名稱>`、`/openapi.json`），給 ChatGPT 自訂 GPT 的動作使用。
  - `upload.js`、`resolve.js`、`route.js`：照片上傳、Google 地圖連結解析、路線計算。
- `supabase/`：資料表與觸發器（依編號執行）。

## 用 AI 編輯

- Claude 聊天：設定 → 連接器 → 新增自訂連接器，網址 `https://benirene-bali-2026.vercel.app/mcp`。
- ChatGPT：設定 → 應用程式 → 進階設定 → 開發者模式 → 建立應用程式，網址同上、驗證選「無」。
- 能執行指令的 AI：貼上「閱讀 https://benirene-bali-2026.vercel.app/ai ，幫我連上 Ben & Irene 的峇里島行程」。

## 部署

```bash
npx -y vercel@latest --prod --yes
```

環境變數（Supabase 網址與金鑰）存在 Vercel 與本機 `.env.local`，不進版本控制。
