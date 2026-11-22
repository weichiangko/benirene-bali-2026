-- 路線（route_geometry / route_sig）是系統自動計算的，不寫進修改紀錄
create or replace function log_change() returns trigger language plpgsql security definer set search_path = public as $$
declare o jsonb; n jsonb;
begin
  if tg_op <> 'INSERT' then o := to_jsonb(old) - 'route_geometry' - 'route_sig'; end if;
  if tg_op <> 'DELETE' then n := to_jsonb(new) - 'route_geometry' - 'route_sig'; end if;
  if tg_op = 'UPDATE' and (o - 'updated_at') = (n - 'updated_at') then return new; end if;
  insert into history(tbl,row_id,op,old,new) values (tg_table_name, coalesce(n->>'id', o->>'id'), tg_op, o, n);
  return coalesce(new, old);
end $$;
