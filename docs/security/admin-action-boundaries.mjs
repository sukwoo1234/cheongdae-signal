// Offline event-bound admin action regression. All identities are synthetic.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const migrationsDir = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create table auth.sessions(id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
  create function auth.jwt() returns jsonb language sql stable as
    $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
  grant usage on schema public,auth to anon,authenticated,service_role;
  grant execute on all functions in schema auth to anon,authenticated,service_role;
  alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
  create schema cron;
  create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
`);
for (const file of files) {
  const sql = (await readFile(join(migrationsDir, file), 'utf8'))
    .replace(/create extension if not exists (pgcrypto|pg_cron);/g, '');
  await db.exec(sql);
}
assert.ok(files.some((file) => file.startsWith('0031_bind_admin_actions_to_event')));

async function rejects(query, expected) {
  await assert.rejects(query(), (error) => String(error.message).includes(expected));
}

const privileges = (await db.query(`
  select
    has_function_privilege('anon','public.acquire_event_admin_action(uuid,uuid,uuid,uuid)','execute') as anon_acquire,
    has_function_privilege('authenticated','public.acquire_event_admin_action(uuid,uuid,uuid,uuid)','execute') as user_acquire,
    has_function_privilege('service_role','public.acquire_event_admin_action(uuid,uuid,uuid,uuid)','execute') as service_acquire,
    has_function_privilege('anon','public.grant_event_slot_for_event(uuid,uuid)','execute') as anon_grant,
    has_function_privilege('authenticated','public.grant_event_slot_for_event(uuid,uuid)','execute') as user_grant,
    has_function_privilege('service_role','public.grant_event_slot_for_event(uuid,uuid)','execute') as service_grant,
    has_function_privilege('authenticated','public.grant_event_slot(uuid)','execute') as legacy_grant,
    has_function_privilege('authenticated','public.ban_event_participant(uuid,text)','execute') as legacy_ban
`)).rows[0];
assert.deepEqual(privileges, {
  anon_acquire: false, user_acquire: false, service_acquire: true,
  anon_grant: false, user_grant: false, service_grant: true,
  legacy_grant: false, legacy_ban: false,
});

const userId = '10000000-0000-4000-8000-000000000001';
const cardId = '20000000-0000-4000-8000-000000000001';
const actionToken = '90000000-0000-4000-8000-000000000001';
const purgeToken = '90000000-0000-4000-8000-000000000002';
const otherToken = '90000000-0000-4000-8000-000000000003';
const email = 'fixture@cju.ac.kr';
const initialEvent = (await db.query('select event_id from public.session_config where id=1')).rows[0].event_id;
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [userId, email]);
await db.query('select * from public.register_event_participant($1,$2,$3,$4)', [initialEvent, userId, email, 'a'.repeat(64)]);
await db.query("update public.users set gender='M',terms_accepted_at=now(),privacy_accepted_at=now() where id=$1", [userId]);
await db.query("insert into public.cards(id,user_id,one_liner,instagram_id,color) values($1,$2,'fixture','fixture_a','yellow')", [cardId, userId]);

const acquired = (await db.query(
  'select public.acquire_event_admin_action($1,$2,$3,null) as user_id',
  [initialEvent, actionToken, cardId],
)).rows[0].user_id;
assert.equal(acquired, userId);
await rejects(() => db.query('select public.begin_event_purge($1,$2)', [initialEvent, purgeToken]), 'MODERATION_BUSY');
assert.equal((await db.query('select purging from public.session_config where id=1')).rows[0].purging, false);

await db.query('select public.release_event_admin_action($1,$2)', [initialEvent, actionToken]);
await db.query('select public.begin_event_purge($1,$2)', [initialEvent, purgeToken]);
await rejects(() => db.query(
  'select public.acquire_event_admin_action($1,$2,null,$3)',
  [initialEvent, otherToken, userId],
), 'PURGE_IN_PROGRESS');
await db.query('select public.purge_current_event_data($1,$2)', [initialEvent, purgeToken]);
const nextEvent = (await db.query(
  'select public.finish_event_purge($1,$2) as event_id', [initialEvent, purgeToken],
)).rows[0].event_id;
assert.notEqual(nextEvent, initialEvent);

await db.query('select * from public.register_event_participant($1,$2,$3,$4)', [nextEvent, userId, email, 'b'.repeat(64)]);
await db.query('update private.event_participants set used=allowance where event_id=$1 and current_user_id=$2', [nextEvent, userId]);
await rejects(() => db.query(
  'select * from public.grant_event_slot_for_event($1,$2)', [initialEvent, userId],
), 'STALE_EVENT');
assert.equal((await db.query(
  'select allowance from private.event_participants where event_id=$1 and current_user_id=$2',
  [nextEvent, userId],
)).rows[0].allowance, 1);
await rejects(() => db.query(
  'select public.acquire_event_admin_action($1,$2,null,$3)',
  [initialEvent, otherToken, userId],
), 'STALE_EVENT');
const granted = (await db.query(
  'select * from public.grant_event_slot_for_event($1,$2)', [nextEvent, userId],
)).rows[0];
assert.equal(granted.allowance, 2);

await rejects(() => db.query(
  'update public.session_config set ends_at=starts_at where id=1',
), 'session_config_valid_window');

console.log('SECURED admin-action event boundary');
