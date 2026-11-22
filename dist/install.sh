#!/bin/sh
# Ben & Irene 峇里島行程：把行程的 MCP 伺服器登記到這台電腦上的 AI 工具。
# 用法：curl -fsSL https://benirene-bali-2026.vercel.app/install.sh | sh
# 只寫入各工具的 MCP 設定，不安裝任何程式、不需要 sudo。DRY_RUN=1 只顯示會做什麼。
set -u
NAME="bali-trip"
URL="https://benirene-bali-2026.vercel.app/mcp"
DONE=""
SKIP=""
FAIL=""

say() { printf '%s\n' "$*"; }
ok() { DONE="$DONE\n  ✓ $1"; }
fail() { FAIL="$FAIL\n  ✗ $1"; }
has() { command -v "$1" >/dev/null 2>&1; }
run() { if [ "${DRY_RUN:-}" = "1" ]; then say "  (dry-run) $*"; return 0; fi; "$@"; }

# 合併 JSON 設定檔：$1 檔案，$2 頂層鍵（mcpServers / servers），$3 伺服器設定 JSON
merge_json() {
  file="$1"; key="$2"; entry="$3"
  if [ "${DRY_RUN:-}" = "1" ]; then say "  (dry-run) 寫入 $file → $key.$NAME"; return 0; fi
  mkdir -p "$(dirname "$file")"
  if has python3; then
    python3 - "$file" "$key" "$NAME" "$entry" <<'PY'
import json, os, sys
f, key, name, entry = sys.argv[1:5]
data = {}
if os.path.exists(f) and os.path.getsize(f) > 0:
    with open(f) as fh: data = json.load(fh)
data.setdefault(key, {})[name] = json.loads(entry)
with open(f, "w") as fh: json.dump(data, fh, indent=2, ensure_ascii=False)
PY
  elif has node; then
    node -e '
const fs=require("fs");const [f,key,name,entry]=process.argv.slice(1);
let d={};try{const t=fs.readFileSync(f,"utf8");if(t.trim())d=JSON.parse(t)}catch(e){if(e.code!=="ENOENT")throw e}
(d[key]=d[key]||{})[name]=JSON.parse(entry);fs.writeFileSync(f,JSON.stringify(d,null,2));' "$file" "$key" "$NAME" "$entry"
  else
    return 1
  fi
}

say "連接 Ben & Irene 峇里島行程 → $URL"

# 先確認伺服器可用
if has curl; then
  if ! curl -fsS -m 20 -X POST "$URL" -H 'Content-Type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | grep -q get_itinerary; then
    say "✗ 連不到行程伺服器，請檢查網路後再試。"; exit 1
  fi
fi

# Claude Code
if has claude; then
  claude mcp remove --scope user "$NAME" >/dev/null 2>&1 || true
  if run claude mcp add --transport http --scope user "$NAME" "$URL" >/dev/null 2>&1; then ok "Claude Code"; else fail "Claude Code（請手動執行：claude mcp add --transport http --scope user $NAME $URL）"; fi
else SKIP="$SKIP Claude Code、"; fi

# Codex CLI
if has codex; then
  codex mcp remove "$NAME" >/dev/null 2>&1 || true
  if run codex mcp add "$NAME" --url "$URL" >/dev/null 2>&1; then ok "Codex"
  else
    cfg="${CODEX_HOME:-$HOME/.codex}/config.toml"
    if [ "${DRY_RUN:-}" = "1" ]; then say "  (dry-run) 寫入 $cfg"; ok "Codex"
    elif ! grep -q "\[mcp_servers.$NAME\]" "$cfg" 2>/dev/null; then
      mkdir -p "$(dirname "$cfg")" && printf '\n[mcp_servers.%s]\nurl = "%s"\n' "$NAME" "$URL" >> "$cfg" && ok "Codex（寫入 $cfg）" || fail "Codex"
    else ok "Codex（已存在）"; fi
  fi
else SKIP="$SKIP Codex、"; fi

# Gemini CLI
if has gemini; then
  gemini mcp remove --scope user "$NAME" >/dev/null 2>&1 || true
  if run gemini mcp add --scope user --transport http "$NAME" "$URL" >/dev/null 2>&1; then ok "Gemini CLI"; else fail "Gemini CLI"; fi
else SKIP="$SKIP Gemini CLI、"; fi

# Cursor
if [ -d "$HOME/.cursor" ] || has cursor; then
  if merge_json "$HOME/.cursor/mcp.json" mcpServers "{\"url\":\"$URL\"}"; then ok "Cursor"; else fail "Cursor（需要 python3 或 node）"; fi
else SKIP="$SKIP Cursor、"; fi

# VS Code（Copilot agent）
if has code; then
  if run code --add-mcp "{\"name\":\"$NAME\",\"type\":\"http\",\"url\":\"$URL\"}" >/dev/null 2>&1; then ok "VS Code"; else fail "VS Code"; fi
else SKIP="$SKIP VS Code、"; fi

# Claude 桌面版（Chat）：透過 mcp-remote 連遠端伺服器，需要 Node.js，重開 Claude 後生效
CD="$HOME/Library/Application Support/Claude"
[ -d "$CD" ] || CD="${XDG_CONFIG_HOME:-$HOME/.config}/Claude"
if [ -d "$CD" ]; then
  if has npx; then
    if merge_json "$CD/claude_desktop_config.json" mcpServers "{\"command\":\"npx\",\"args\":[\"-y\",\"mcp-remote\",\"$URL\"]}"; then ok "Claude 桌面版（完全結束並重開 Claude 後生效）"; else fail "Claude 桌面版（需要 python3 或 node）"; fi
  else fail "Claude 桌面版（需要 Node.js；或在 Claude 設定 → Connectors → 新增自訂連接器，貼上 $URL）"; fi
else SKIP="$SKIP Claude 桌面版、"; fi

say ""
if [ -n "$DONE" ]; then printf '已連接：%b\n' "$DONE"; fi
if [ -n "$FAIL" ]; then printf '未完成：%b\n' "$FAIL"; fi
if [ -n "$SKIP" ]; then say "沒有偵測到：${SKIP%、}"; fi
say ""
say "下一步：新的工具通常在重開對話（或重新載入 MCP）後出現，名稱為 $NAME。"
say "在那之前，AI 可直接用 HTTP 操作：curl -s -X POST $URL -H 'Content-Type: application/json' -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"get_itinerary\",\"arguments\":{}}}'"
[ -n "$DONE" ] || exit 2
