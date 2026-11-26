# 複製一份自己的行程網站（給 AI 助理的步驟）

> 使用者想要一份和 {{SITE}} 一樣、但完全屬於自己的行程網站：自己的網址、自己的資料庫、自己的 MCP。照下面步驟部署到**使用者自己的 Vercel 帳號**。不會修改 {{SITE}} 本身。
> 使用者唯一要親手做的事是在瀏覽器登入 Vercel（第 3 步）。其他步驟都由你執行；每個指令都要看輸出，失敗時照「常見問題」處理，不要跳過、不要把失敗說成成功。

範本原始碼：{{REPO}}

## 0. 你能不能執行指令？

- **能**（Claude Code、Claude 桌面版的 Code 分頁、Codex、Cursor、Gemini CLI…）：照下面 1–7 步全自動完成。
- **不能**（Claude 聊天、ChatGPT）：呼叫 `duplicate_site` 取得 `deploy_button` 連結給使用者，或請他把這段話貼到能執行指令的 AI（例如 Claude 桌面版的 Code 分頁）：「閱讀 {{SITE}}/duplicate ，幫我複製一份自己的行程網站」。

需要：Node.js 20 以上（`node -v`）、git。沒有的話請使用者先安裝（macOS：`brew install node git`，或到 https://nodejs.org 下載）。

## 1. 先問使用者（一次問完）

1. 這趟旅程叫什麼？（例如「羅馬七日」）
2. 目的地？（英文，例如 Rome, Italy）
3. 出發／回程日期？（可以之後再補）
4. 跟誰一起去？（顯示在封面，可略）
5. 要**複製 {{SHORT}} 目前的行程**當範本再改（copy），還是**從空白開始**（blank）？
6. 網址名稱：英文小寫、數字與 `-`，例如 `rome-2027` → 網址會是 `rome-2027.vercel.app`（被用走時 Vercel 會自動加後綴）。

如果你有這個網站的 MCP 工具，可以把答案傳給 `duplicate_site`，它會回傳已經填好名稱的指令。下面用 `<名稱>` 代表第 6 題的答案。

## 2. 下載網站原始碼

在使用者的家目錄或他指定的資料夾執行：

```
git clone --depth 1 {{REPO}}.git <名稱> && cd <名稱> && rm -rf .git .vercel
```

之後所有指令都在這個資料夾裡執行。

## 3. 登入 Vercel（使用者動手）

```
npx -y vercel@latest whoami || npx -y vercel@latest login
```

`whoami` 印出帳號名稱代表已經登入，直接下一步。否則 `login` 會顯示一個網址與代碼並打開瀏覽器：**請使用者在瀏覽器登入 Vercel 並按確認**（沒有帳號可以當場用 GitHub、Google 或 email 免費註冊），你等指令自己結束。不要要求、也不要經手使用者的密碼或 token。

## 4. 建立 Vercel 專案

```
npx -y vercel@latest link --yes --project <名稱>
```

## 5. 建立資料庫（Supabase，透過 Vercel Marketplace）

```
npx -y vercel@latest integration add supabase --name <名稱>-db
```

會在使用者的 Vercel 帳號建立一個 Supabase 資料庫（免費方案），並自動把 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`POSTGRES_URL` 等環境變數加進這個專案。不需要另外註冊 Supabase。

- 跳出選項（方案、區域）時：方案選免費（Free / Hobby），區域選離使用者最近的。
- 如果說需要先同意條款（terms）：請使用者自己在終端機執行 `npx -y vercel@latest integration accept-terms supabase`，或打開輸出裡的網址在瀏覽器按同意，完成後你再重跑這一步。同意條款要由使用者本人決定，不要替他按。
- 完成後用 `npx -y vercel@latest env ls` 確認有 `POSTGRES_URL` 與 `SUPABASE_URL`。

## 6. 設定初始內容並部署

依第 1 題的第 5 題答案：

- 複製範本（copy）：
  ```
  printf %s copy | npx -y vercel@latest env add SEED production
  printf %s {{SITE}} | npx -y vercel@latest env add SEED_FROM production
  ```
- 空白開始（blank）：
  ```
  printf %s blank | npx -y vercel@latest env add SEED production
  ```

再設定 MCP 名稱（AI 工具裡顯示的名字）並部署：

```
printf %s <名稱> | npx -y vercel@latest env add MCP_NAME production
npx -y vercel@latest deploy --prod --yes
```

部署時會自動建立資料表並放入初始內容（看輸出裡的 `[setup-db]`）。最後一行的 `https://….vercel.app` 就是新網站網址，下面稱為 `<新網址>`。

確認成功：

```
curl -s -X POST <新網址>/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_trip","arguments":{}}}'
```

## 7. 換成使用者的旅程

用**新網站**的 MCP（`<新網址>/mcp`；工具還沒出現前，直接用上面的 curl 方式呼叫，把 `name` 和 `arguments` 換掉）：

1. `update_trip`：填入第 1 步的標題、目的地、日期、同行的人；blank 的話再換一張有授權的封面照片。
2. `set_theme`：依目的地設計配色、字體與地圖風格（規則見 `<新網址>/ai`）。
3. copy 的話，問使用者範本裡的天數與景點要保留、修改還是刪除；blank 的話問他要不要現在開始排行程。
4. 讓這台電腦上的 AI 工具都能編輯新網站：`curl -fsSL <新網址>/install.sh | sh`
5. 告訴使用者新網址，以及之後在任何 AI 說「閱讀 <新網址>/ai ，幫我連上我的行程」就能編輯。

## 常見問題

- `git clone` 要求登入或 404：範本 repo 不是公開的。告訴使用者這個網站的擁有者還沒開放複製，停止。
- `vercel` 指令被沙盒擋住網路（例如 Codex）：用你所在環境的權限流程請使用者允許網路存取後重跑。
- 部署時 `[setup-db]` 出錯：把錯誤訊息完整告訴使用者；修正後重跑 `npx -y vercel@latest deploy --prod --yes`，已完成的步驟會自動略過。
- 新網站打開是空白或顯示「未連線到資料庫」：通常是第 5 步的環境變數沒加到 Production，用 `npx -y vercel@latest env ls` 檢查後重新部署。
- 網址名稱被用走：Vercel 會自動給一個帶後綴的網址，以部署輸出為準；想換網址可在 Vercel 專案的 Settings → Domains 修改。
