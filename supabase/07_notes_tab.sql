-- 行前區塊的「須知」分頁可開關：國內行程可關掉，只留待辦與預訂
alter table trip add column if not exists notes_enabled boolean not null default true;
alter table trip add column if not exists notes_title text not null default '入境與須知';
notify pgrst, 'reload schema';
