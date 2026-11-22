-- 整趟旅程的設定（只有一列 id='main'）：封面、行前頁說明、主題（配色與字體）
create table if not exists trip(
  id text primary key default 'main' check (id = 'main'),
  title text not null default '',
  subtitle text not null default '',
  travelers text not null default '',
  destination text not null default '',
  start_date date,
  end_date date,
  intro text not null default '',
  cover_image text not null default '',
  cover_caption text not null default '',
  cover_focus text not null default 'center',
  prep_title text not null default '行前資料與預訂清單',
  prep_intro text not null default '',
  theme jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
alter table trip enable row level security;
drop policy if exists open_all on trip;
create policy open_all on trip for all to anon, authenticated using (true) with check (true);
grant select, insert, update on trip to anon, authenticated;
drop trigger if exists trip_touch on trip;
create trigger trip_touch before update on trip for each row execute function touch_updated();
drop trigger if exists trip_log on trip;
create trigger trip_log after insert or update or delete on trip for each row execute function log_change();
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='trip') then
    alter publication supabase_realtime add table trip;
  end if;
end $$;
insert into trip(id,title,subtitle,travelers,destination,start_date,end_date,intro,cover_image,cover_caption,cover_focus,prep_intro,theme)
values ('main','峇里島跨年','8 天 7 夜 · 烏布森林、火山日出、佩尼達島與海邊跨年','Ben & Irene','Bali, Indonesia','2026-12-26','2027-01-02',
 '從烏布的稻田與聖泉寺出發，清晨登上巴杜爾火山看日出，再到海神廟、佩尼達島的恐龍灣，最後在海邊迎接 2027。',
 'img/87c7e2e1df829e99.webp','Mount Batur 火山日出','center 45%',
 '勾選和內容都會同步給所有看這個網站的人；店家是否接受預約，以實際確認信為準。',
 '{"preset":"bali"}')
on conflict (id) do nothing;
notify pgrst, 'reload schema';
