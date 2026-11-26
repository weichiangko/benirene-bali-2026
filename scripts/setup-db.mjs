// 部署時執行（vercel.json 的 buildCommand）：建立或更新資料表，新資料庫再放入初始行程。
// 需要 POSTGRES_URL_NON_POOLING 或 POSTGRES_URL（Vercel Marketplace 的 Supabase 整合會自動加入）。
// 沒有這些變數時直接略過，不影響部署（例如原本手動建好資料庫的網站）。
//
// 初始內容（只在全新的資料庫執行一次）：
//   SEED=copy  + SEED_FROM=<來源網站>  複製來源網站目前的行程（GET <來源>/api/export）
//   SEED=copy（沒有 SEED_FROM）或未設定   使用 dist/seed.json 的範本行程
//   SEED=blank                           空白行程，只留一天
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const log = (...a) => console.log('[setup-db]', ...a);
const DB_URL = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!DB_URL) {
  log('沒有 POSTGRES_URL，略過資料庫設定。');
  process.exit(0);
}

const { default: pg } = await import('pg');
// Supabase 的憑證鏈 node 預設不認得；連線仍走 TLS 加密
const url = new URL(DB_URL);
url.searchParams.delete('sslmode');
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
const db = new pg.Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
await db.connect();

const files = fs.readdirSync(path.join(ROOT, 'supabase')).filter(f => /^\d+_.*\.sql$/.test(f)).sort();
const exists = async t => (await db.query('select to_regclass($1) as r', [`public.${t}`])).rows[0].r !== null;

try {
  const hadTable = await exists('_migrations');
  const fresh = !(await exists('days'));
  await db.query('create table if not exists _migrations(name text primary key, at timestamptz not null default now())');
  await db.query('alter table _migrations enable row level security'); // 不開放給前端
  if (!hadTable && !fresh) {
    // 這個資料庫是手動建好的：視為現有檔案都已套用，之後只跑新加的檔案
    for (const f of files) await db.query('insert into _migrations(name) values ($1) on conflict do nothing', [f]);
    log('既有資料庫，記錄目前的版本：', files.join(', '));
  }
  const done = new Set((await db.query('select name from _migrations')).rows.map(r => r.name));
  for (const f of files) {
    if (done.has(f)) continue;
    log('套用', f);
    const sql = fs.readFileSync(path.join(ROOT, 'supabase', f), 'utf8');
    try {
      await db.query('begin');
      await db.query(sql);
      await db.query('insert into _migrations(name) values ($1)', [f]);
      await db.query('commit');
    } catch (e) {
      await db.query('rollback');
      if (/storage\./.test(sql) && await createBucketViaApi()) {
        await db.query('insert into _migrations(name) values ($1)', [f]);
        continue;
      }
      throw new Error(`${f} 失敗：${e.message}`);
    }
  }
  if (fresh) await seed();
  await db.query(`notify pgrst, 'reload schema'`);
  log('完成');
} finally {
  await db.end();
}

// 有些 Supabase 專案的 postgres 角色不能直接寫 storage.buckets，改用 Storage API 建立
async function createBucketViaApi() {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!base || !key) return false;
  const r = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'photos', name: 'photos', public: true, file_size_limit: 8388608, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] }),
  });
  const ok = r.ok || /already exists/i.test(await r.text());
  log(ok ? '用 Storage API 建立 photos bucket' : '無法建立 photos bucket');
  return ok;
}

async function loadSeed() {
  const mode = (process.env.SEED || 'copy').toLowerCase();
  if (mode === 'blank') return { mode, data: { days: [{ id: 1, position: 0, title: '第一天' }], items: [], checks: [], notes: [], trip: [] } };
  const from = (process.env.SEED_FROM || '').replace(/\/+$/, '');
  if (from) {
    try {
      const r = await fetch(`${from}/api/export`, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return { mode: `copy from ${from}`, data: await r.json(), from };
    } catch (e) { log(`讀不到 ${from}/api/export（${e.message}），改用範本 seed.json`); }
  }
  return { mode: 'template', data: JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'seed.json'), 'utf8')) };
}

// 只放資料表真的有的欄位；jsonb 欄位轉成 JSON 字串
async function insertRows(table, rows) {
  if (!rows || !rows.length) return;
  const cols = (await db.query(`select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1`, [table])).rows;
  const type = Object.fromEntries(cols.map(c => [c.column_name, c.data_type]));
  for (const row of rows) {
    const keys = Object.keys(row).filter(k => k in type && k !== 'updated_at');
    const vals = keys.map(k => (type[k] === 'jsonb' && row[k] != null ? JSON.stringify(row[k]) : row[k]));
    await db.query(`insert into ${table} (${keys.map(k => `"${k}"`).join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) on conflict (id) do update set ${keys.filter(k => k !== 'id').map(k => `"${k}"=excluded."${k}"`).join(',') || 'id=excluded.id'}`, vals);
  }
}

async function seed() {
  const { mode, data, from } = await loadSeed();
  log('放入初始內容：', mode);
  // 從其他網站複製時，相對路徑的照片（img/...）若這份程式碼裡沒有，就改用來源網站的完整網址
  const abs = p => (from && p && !/^https?:/.test(p) && !fs.existsSync(path.join(ROOT, 'dist', p)) ? `${from}/${p}` : p);
  const items = (data.items || []).map(x => ({ ...x, photos: (x.photos || []).map(p => ({ ...p, image: abs(p.image) })) }));
  const trip = (data.trip || []).map(t => ({ ...t, cover_image: abs(t.cover_image) }));
  await db.query('begin');
  try {
    await db.query('delete from items; delete from days; delete from checks; delete from notes;');
    await insertRows('days', data.days);
    await insertRows('items', items);
    await insertRows('checks', (data.checks || []).map(c => ({ ...c, done: false })));
    await insertRows('notes', data.notes);
    if (mode === 'blank') {
      await db.query(`update trip set title='我的旅程', subtitle='', travelers='', destination='', start_date=null, end_date=null, intro='', cover_image='', cover_caption='', prep_intro='', theme='{}' where id='main'`);
    } else if (trip.length) {
      // 圖示不沿用來源網站的，新網站預設依自己的主題自動產生
      await insertRows('trip', trip.map(t => ({ ...t, id: 'main', icon_image: '' })));
    }
    await db.query(`select setval(pg_get_serial_sequence('days','id'), greatest((select coalesce(max(id),0) from days),1))`);
    await db.query('delete from history'); // 初始內容不算修改紀錄
    await db.query('commit');
  } catch (e) { await db.query('rollback'); throw e; }
  log(`天數 ${(data.days || []).length}、項目 ${items.length}、待辦 ${(data.checks || []).length}`);
}
