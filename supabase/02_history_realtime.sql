do $$ declare t text; begin
  foreach t in array array['days','items','checks','notes'] loop
    execute format('drop trigger if exists %I_log on %I', t, t);
    execute format('create trigger %I_log after insert or update or delete on %I for each row execute function log_change()', t, t);
  end loop;
end $$;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='items') then
    alter publication supabase_realtime add table days, items, checks, notes, history;
  end if;
end $$;
