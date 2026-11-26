// 部署相關設定：網址與資料庫都從環境變數取得，同一份程式碼可以部署成任何人的行程網站。
// SITE_URL（選填）> Vercel 正式網址 > 這次部署的網址 > 本機。
const host = h => (h ? `https://${String(h).replace(/^https?:\/\//, '').replace(/\/+$/, '')}` : '');
const SITE = (process.env.SITE_URL || '').replace(/\/+$/, '')
  || host(process.env.VERCEL_PROJECT_PRODUCTION_URL)
  || host(process.env.VERCEL_URL)
  || `http://localhost:${process.env.PORT || 3000}`;

// Supabase：手動設定或 Vercel Marketplace 的 Supabase 整合自動加入的變數名稱都可以
const SB_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
const SB_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';

// MCP 伺服器名稱（AI 工具裡顯示的名稱）：MCP_NAME，否則用網址的第一段，例如 rome-2027
const MCP_NAME = (process.env.MCP_NAME || new URL(SITE).hostname.split('.')[0] || 'trip')
  .toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'trip';

// 一鍵複製用：公開的範本 repo
const TEMPLATE_REPO = (process.env.TEMPLATE_REPO || 'https://github.com/weichiangko/benirene-bali-2026').replace(/\/+$/, '').replace(/\.git$/, '');

const UA = `trip-site/1.0 (+${SITE}/ai)`;

module.exports = { SITE, SB_URL, SB_KEY, SB_SERVICE, MCP_NAME, TEMPLATE_REPO, UA };
