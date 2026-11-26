# Ben & Irene 峇里島跨年行程

https://benirene-bali-2026.vercel.app

可離線使用的旅行行程網站（PWA）：封面＋行前資料、每日路線地圖、景點照片相簿，內容存在 Supabase，網站上或任何 AI 都能直接編輯。

## 結構

- `dist/`：靜態網站。`app.js` 主程式、`themes.js` 主題（配色、字體、地圖底圖與色調）、`sw.js` 離線快取、`seed.json` 範本行程。
- `docs/`：依部署環境產生的文字範本（`{{SITE}}` 等變數換成這個網站的網址與旅程名稱），由 `api/site.js` 提供：`/ai`（`llms.txt`，給 AI 的說明）、`/install.sh`、`/duplicate`（複製網站的步驟）、`/manifest.webmanifest`；`/config.js` 也由它依環境變數產生。
- `api/`：Vercel 函式。
  - `mcp.js`：MCP 伺服器（`/mcp`，Streamable HTTP，免登入），Claude 聊天、ChatGPT、Claude Code、Codex 等都能接。包含 `duplicate_site` 工具。
  - `tools.js`、`openapi.js`：同一組工具的 REST 版（`/api/tools/<名稱>`、`/openapi.json`），給 ChatGPT 自訂 GPT 的動作使用。
  - `upload.js`、`resolve.js`、`route.js`：照片上傳、Google 地圖連結解析、路線計算。
  - `export.js`：整份行程的原始資料（`/api/export`），複製網站時當初始內容。
  - `_lib/env.js`：網址與資料庫設定，全部來自環境變數。
- `supabase/`：資料表與觸發器（依編號執行）。部署時由 `scripts/setup-db.mjs` 自動套用。

## 用 AI 編輯

- Claude 聊天：設定 → 連接器 → 新增自訂連接器，網址 `https://benirene-bali-2026.vercel.app/mcp`。
- ChatGPT：設定 → 應用程式 → 進階設定 → 開發者模式 → 建立應用程式，網址同上、驗證選「無」。
- 能執行指令的 AI：貼上「閱讀 https://benirene-bali-2026.vercel.app/ai ，幫我連上 Ben & Irene 的峇里島行程」。

## 部署

```bash
npx -y vercel@latest --prod --yes
```

部署時會執行 `npm run build`（`scripts/setup-db.mjs`）：有 `POSTGRES_URL` 時自動建立或更新資料表，全新的資料庫再放入初始行程；沒有就略過。

環境變數（存在 Vercel 與本機 `.env.local`，不進版本控制）：

| 變數 | 說明 |
| --- | --- |
| `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY` | Supabase 連線（Vercel Marketplace 的 Supabase 整合會自動加入） |
| `POSTGRES_URL` 或 `POSTGRES_URL_NON_POOLING` | 選填；有的話部署時自動建立資料表 |
| `SITE_URL` | 選填；預設用 Vercel 的正式網址 |
| `MCP_NAME` | 選填；AI 工具裡顯示的 MCP 名稱，預設用網址第一段。這個網站設成 `bali-trip` 可維持原本的名稱 |
| `SEED`、`SEED_FROM` | 選填；全新資料庫的初始內容：`copy`（預設，`SEED_FROM` 給來源網站時複製它目前的行程，否則用 `seed.json`）或 `blank` |
| `TEMPLATE_REPO` | 選填；複製網站時下載的公開 repo |

## 複製一份自己的網站

任何人都可以把這個網站整份複製到自己的 Vercel 帳號（自己的網址、資料庫與 MCP）：

- 能執行指令的 AI（Claude Code、Claude 桌面版的 Code 分頁、Codex…）：貼上「閱讀 https://<網站>/duplicate ，幫我複製一份自己的行程網站」。AI 會問幾個問題，然後全自動部署，使用者只需要登入 Vercel。
- 已連上 MCP 的 AI：說「我想要一份自己的行程網站」，AI 會用 `duplicate_site`。
- 只能聊天的 AI：`duplicate_site` 會給一個 Vercel 一鍵部署連結。

前提：`TEMPLATE_REPO`（預設本 repo）必須是公開的。
