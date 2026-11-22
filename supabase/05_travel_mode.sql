-- 到這個地點的交通方式（從前一個有位置的項目出發）：car 開車（沿道路）、boat 搭船、plane 搭飛機（直線虛線）
alter table items add column if not exists travel_mode text not null default 'car';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'items_travel_mode_check') then
    alter table items add constraint items_travel_mode_check check (travel_mode in ('car','boat','plane'));
  end if;
end $$;
notify pgrst, 'reload schema';
