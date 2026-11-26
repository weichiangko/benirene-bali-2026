-- 網站圖示（favicon、PWA、MCP）：空字串＝依主題配色自動產生；網址＝使用者上傳的圖片（Supabase Storage 的公開網址）
alter table trip add column if not exists icon_image text not null default '';
notify pgrst, 'reload schema';
