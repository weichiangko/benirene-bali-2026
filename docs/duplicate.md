# 複製一份自己的行程網站（給 AI 助理的步驟）

> 使用者想要一份和 {{SITE}} 一樣、但完全屬於自己的行程網站：自己的網址、自己的資料庫、自己的 MCP。照下面步驟部署到**使用者自己的 Vercel 帳號**。不會修改 {{SITE}} 本身。
> 使用者要親手做的事只有：在瀏覽器登入 Vercel（第 3 步），以及第一次用 Supabase 時在瀏覽器按一次同意條款（第 5 步）。部署完成後，新網站的 MCP 要接到這台電腦的 AI 工具上、網站要自動打開，使用者不需要再做任何設定。其他步驟都由你執行；每個指令都要看輸出，失敗時照「常見問題」處理，不要跳過、不要把失敗說成成功。

範本原始碼：{{REPO}}

## 0. 你能不能執行指令？

- **能**（Grok Bot、Claude Code、Claude 桌面版的 Code 分頁、Codex、Cursor、Gemini CLI…）：照下面每一步全自動完成。如果你是在**自己的雲端電腦**上執行指令（例如 Grok Bot），不是使用者的電腦：`install.sh` 只會把 MCP 接到你自己身上；「打開網站」改成把網址傳給使用者請他點開。
- **不能**（Claude 聊天、ChatGPT）：呼叫 `duplicate_site` 取得 `deploy_button` 連結給使用者，或請他把這段話貼到能執行指令的 AI（例如 Claude 桌面版的 Code 分頁）：「閱讀 {{SITE}}/duplicate ，幫我複製一份自己的行程網站」。

需要：Node.js 20 以上（`node -v`）、git。沒有的話請使用者先安裝（macOS：`brew install node git`，或到 https://nodejs.org 下載）。

## 1. 先問使用者（一次問完）

**一定要先問、等使用者回答後才開始第 2 步。** 不要自己編答案或用範例值；選填的題目使用者說跳過才跳過。

**用你的提問工具問**：如果你有讓使用者點選答案的工具（選項按鈕、表單，例如 Claude Code 的 AskUserQuestion），請用它。第 5 題做成四個選項；其他題目讓使用者自由輸入（工具有「其他」欄位就用它）。沒有這種工具就用文字問，第 5 題把四個選項列出來。之後第 3b 步確認帳號、第 8 步問行程細節時也一樣。

1. 這趟旅程叫什麼？（例如「羅馬七日」）
2. 目的地？（英文，例如 Rome, Italy）
3. 出發／回程日期？（可以之後再補）
4. 跟誰一起去？（顯示在封面，可略）
5. 新網站一開始的行程要怎麼來？（四選一）
   - **沿用 {{SHORT}} 目前的行程**（copy）：複製現在的行程當範本，之後再改。
   - **我已經有行程表**（import）：部署好後貼上文字、檔案、連結或截圖，你幫他整理填進去。
   - **讓 AI 幫我排**（plan）：部署好後再問天數、想去的地方、步調與預算，由你排好每天的行程。
   - **從空白開始**（blank）：只留第一天，之後自己慢慢加。
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

## 3b. 確認要部署到哪個帳號與團隊（一定要問）

這台電腦的 Vercel CLI 可能早就登入了別的帳號（例如公司帳號），和使用者在瀏覽器登入的不一樣；部署錯帳號，之後在瀏覽器同意條款、管理網站時都會找不到（Vercel 會顯示 404）。所以一定要先確認：

```
npx -y vercel@latest whoami
npx -y vercel@latest teams ls
```

把結果整理給使用者，**等他回答**：

1. 「Vercel CLI 目前登入的帳號是 `<whoami 結果>`，要部署到這個帳號嗎？」
   - 不是：**不要登出原本的帳號**（使用者其他專案可能還在用）。改用獨立的登入資料夾：執行 `npx -y vercel@latest --global-config ~/.vercel-trip login`，請他在瀏覽器（建議無痕視窗）用正確的帳號登入。之後本頁每個 vercel 指令都加上 `--global-config ~/.vercel-trip`，然後重新做這一步確認。
2. 列出 `teams ls` 的團隊（只有一個就直接確認那一個）：「要部署到哪一個？」把答案的團隊 **slug**（`teams ls` 第一欄）記成 `<團隊>`，之後每個 vercel 指令都加 `--scope <團隊>`。
3. 提醒使用者：之後若要在瀏覽器按同意（第 5 步），瀏覽器也要登入**同一個** Vercel 帳號；不確定就用無痕視窗開啟。

## 4. 建立 Vercel 專案

```
npx -y vercel@latest --scope <團隊> link --yes --project <名稱>
```

## 5. 建立資料庫（Supabase，透過 Vercel Marketplace）

```
npx -y vercel@latest --scope <團隊> integration add supabase --name <名稱>-db
```

會在使用者的 Vercel 帳號建立一個 Supabase 資料庫（免費方案），並自動把 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`POSTGRES_URL` 等環境變數加進這個專案。不需要另外註冊 Supabase。

- 跳出選項（方案、區域）時：方案選免費（Free / Hobby），區域選離使用者最近的。
- 如果說需要先同意條款（terms）：請使用者自己在終端機執行 `npx -y vercel@latest --scope <團隊> integration accept-terms supabase`，或打開輸出裡的網址在瀏覽器按同意，完成後你再重跑這一步。同意條款要由使用者本人決定，不要替他按。
- 完成後用 `npx -y vercel@latest --scope <團隊> env ls` 確認有 `POSTGRES_URL` 與 `SUPABASE_URL`。

## 6. 設定初始內容並部署

依第 1 題的第 5 題答案：

- 複製範本（copy）：
  ```
  printf %s copy | npx -y vercel@latest --scope <團隊> env add SEED production
  printf %s {{SITE}} | npx -y vercel@latest --scope <團隊> env add SEED_FROM production
  ```
- 其他三種（import、plan、blank）都從空白開始，部署後在第 8 步由你填內容：
  ```
  printf %s blank | npx -y vercel@latest --scope <團隊> env add SEED production
  ```

再設定 MCP 名稱（AI 工具裡顯示的名字）並部署：

```
printf %s <名稱> | npx -y vercel@latest --scope <團隊> env add MCP_NAME production
npx -y vercel@latest --scope <團隊> deploy --prod --yes
```

部署時會自動建立資料表並放入初始內容（看輸出裡的 `[setup-db]`）。最後一行的 `https://….vercel.app` 就是新網站網址，下面稱為 `<新網址>`。

確認成功：

```
curl -s -X POST <新網址>/mcp -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_trip","arguments":{}}}'
```

## 7. 接上新網站的 MCP（必做）

把新網站的 MCP 登記到這台電腦上所有 AI 工具（Claude Code、Codex、Claude 桌面版、Cursor…），之後在任何對話都能直接編輯：

```
curl -fsSL <新網址>/install.sh | sh
```

照實回報輸出的「已連接／未完成」。新工具通常要重開對話才出現；在那之前，用上面的 curl 方式呼叫新網站的工具（把 `name` 和 `arguments` 換掉），不要因此中斷。

## 8. 換成使用者的旅程

用**新網站**的 MCP（`<新網址>/mcp`）：

1. `update_trip`：填入第 1 步的標題、目的地、日期、同行的人。
2. `set_theme`：依目的地設計配色、字體與地圖風格（規則見 `<新網址>/ai`）。
3. 依第 1 步第 5 題的選擇：
   - **copy**：問他範本裡的天數與景點要保留、修改還是刪除（可用提問工具讓他勾選），照回答調整。
   - **import**：請他把現有的行程表給你（貼上文字、上傳檔案、Google 文件或試算表連結、截圖都可以）。整理成每天的行程：`add_day`／`update_day`、`add_place`（附 Google 地圖連結或地名）、時間、餐廳與預訂資訊、`add_checklist_item` 行前待辦。看不清楚或缺的資訊問他，不要自己編。
   - **plan**：再問幾件事（用提問工具）：每天的步調（悠閒／適中／緊湊）、一定想去的地方或想做的事、住宿區域、預算、同行者的需求（長輩、小孩、飲食限制）。然後排好每天的行程：`add_day`／`update_day`、`add_place`、`travel_mode`、餐廳、雨備與行前待辦；排完請他看過再調整。
   - **blank**：不用排，第 4、5 步也可以跳過。
4. 照片（copy、import、plan）：**每一天都要有照片**：封面「旅程一覽」的每日卡片會用當天項目的第 1 張照片，沒有照片就是一塊空白。替每天最有代表性的景點用 `add_photo` 加一張有授權的照片（Wikimedia Commons 最方便：`image_url` 用 `https://commons.wikimedia.org/wiki/Special:FilePath/<檔名>?width=1600`，填 `credit`（作者／授權，例如「Wikimedia / CC BY-SA 4.0」）與 `source`（檔案頁網址））；不要用沒有授權的圖片。copy 的話，範本裡和新目的地無關的照片要一起換掉或刪除。最後用 `get_itinerary` 檢查每天至少有一個項目 `photos` 不是空的。
5. 封面照片：`update_trip` 的 `cover_from_item`（選一張最能代表這趟旅程的）或 `cover_image_url`。

## 9. 打開網站，交給使用者

1. 打開新網站：macOS `open <新網址>/`、Linux `xdg-open <新網址>/`、Windows `start <新網址>/`。
2. 告訴使用者：新網址、MCP 已接到哪些 AI 工具（第 7 步的結果）、重開對話後就能直接說「幫我改行程」。
3. blank 的話告訴他網站已經準備好，之後隨時可以說「幫我加景點」或「幫我排行程」。
4. 分享給旅伴：傳這句給對方，對方貼給自己的 AI 就會接好 MCP 並打開網站：「閱讀 <新網址>/ai ，幫我連上我們的行程並打開網站」。網站封面的「分享給旅伴」按鈕也會複製這句。

## 常見問題

- `git clone` 要求登入或 404：範本 repo 不是公開的。告訴使用者這個網站的擁有者還沒開放複製，停止。
- `vercel` 指令被沙盒擋住網路（例如 Codex）：用你所在環境的權限流程請使用者允許網路存取後重跑。
- 部署時 `[setup-db]` 出錯：把錯誤訊息完整告訴使用者；修正後重跑 `npx -y vercel@latest --scope <團隊> deploy --prod --yes`，已完成的步驟會自動略過。
- 新網站打開是空白或顯示「未連線到資料庫」：通常是第 5 步的環境變數沒加到 Production，用 `npx -y vercel@latest --scope <團隊> env ls` 檢查後重新部署。
- 網址名稱被用走：Vercel 會自動給一個帶後綴的網址，以部署輸出為準；想換網址可在 Vercel 專案的 Settings → Domains 修改。
