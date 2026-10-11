// Isolated PGlite regression for the current migrations through 0030.
// All identities and contacts below are synthetic; no remote service is used.
import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { PGlite } = require('@electric-sql/pglite');
const db = new PGlite();
const purgeToken = '90000000-0000-4000-8000-000000000001';
let checks = 0;
function secured(name, actual) {
  assert.ok(actual, name);
  console.log(`SECURED ${++checks}: ${name}`);
}
async function rejected(name, query, expected) {
  try {
    await query();
    assert.fail(`${name}: expected rejection`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    secured(name, String(error.message).includes(expected));
  }
}

await db.exec(`
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth;
  create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
  create table auth.sessions(
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    not_after timestamptz
  );
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

const migrationDir = process.argv[2]
  ? resolve(process.argv[2])
  : fileURLToPath(new URL('../../supabase/migrations/', import.meta.url));
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
for (const file of migrations) {
  const sql = (await readFile(join(migrationDir, file), 'utf8'))
    .replace(/create extension if not exists (pgcrypto|pg_cron);/g, '');
  await db.exec(sql);
}
secured('current migrations through 0030 apply cleanly',
  migrations.length >= 29 && migrations.some((name) => name.startsWith('0030_bind_card_writes_to_event')));

const cardRpcPrivileges = (await db.query(`
  select
    has_function_privilege('anon', 'public.create_event_card(uuid,uuid,text,text,text,text)', 'execute') as anon_create,
    has_function_privilege('authenticated', 'public.create_event_card(uuid,uuid,text,text,text,text)', 'execute') as user_create,
    has_function_privilege('service_role', 'public.create_event_card(uuid,uuid,text,text,text,text)', 'execute') as service_create,
    has_function_privilege('anon', 'public.update_event_card(uuid,uuid,text,text,text,text,boolean)', 'execute') as anon_update,
    has_function_privilege('authenticated', 'public.update_event_card(uuid,uuid,text,text,text,text,boolean)', 'execute') as user_update,
    has_function_privilege('service_role', 'public.update_event_card(uuid,uuid,text,text,text,text,boolean)', 'execute') as service_update
`)).rows[0];
secured('card write RPCs execute only for the service role',
  !cardRpcPrivileges.anon_create && !cardRpcPrivileges.user_create && cardRpcPrivileges.service_create
  && !cardRpcPrivileges.anon_update && !cardRpcPrivileges.user_update && cardRpcPrivileges.service_update);

const A = '10000000-0000-4000-8000-000000000001';
const B = '10000000-0000-4000-8000-000000000002';
const C = '10000000-0000-4000-8000-000000000003';
const D = '10000000-0000-4000-8000-000000000004';
const sessions = [A, B, C, D].map((_, i) => `30000000-0000-4000-8000-00000000000${i + 1}`);
const ids = [A, B, C, D];
const emails = ['a@cju.ac.kr', 'b@cju.ac.kr', 'c@cju.ac.kr', 'd@cju.ac.kr'];

async function owner() { await db.exec('reset role'); }
async function identity(index, method = 'otp') {
  await owner();
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: ids[index], session_id: sessions[index], amr: [{ method }] }),
  ]);
  await db.exec('set role authenticated');
}

await owner();
await db.query("update public.session_config set starts_at=now()-interval '1 hour',ends_at=now()+interval '1 hour',threshold_male=1,threshold_female=1,force_locked=false where id=1");
const initialEvent = (await db.query('select event_id from public.session_config where id=1')).rows[0].event_id;
for (let i = 0; i < ids.length; i++) {
  await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [ids[i], emails[i]]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[i], ids[i]]);
  await db.query('select * from public.register_event_participant($1,$2,$3,$4)', [
    initialEvent, ids[i], emails[i], String.fromCharCode(97 + i).repeat(64),
  ]);
}
await db.query("update public.users set gender='M',terms_accepted_at=now(),privacy_accepted_at=now() where id=$1", [B]);
await db.query("update public.users set gender='F',terms_accepted_at=now(),privacy_accepted_at=now() where id=$1", [C]);
await db.query("insert into public.cards(user_id,one_liner,instagram_id,color) values($1,'male card','fixture_m','yellow'),($2,'female card','fixture_f','pink')", [B, C]);

const anonPrivileges = (await db.query(`
  select has_table_privilege('anon','public.session_config','select') as config,
         has_function_privilege('anon','public.gender_counts()','execute') as counts,
         has_function_privilege('anon','public.board_is_open()','execute') as board
`)).rows[0];
secured('anonymous role lacks metadata and count grants', !anonPrivileges.config && !anonPrivileges.counts && !anonPrivileges.board);

await db.exec('set role service_role');
secured('service role keeps event count access', (await db.query('select * from public.gender_counts()')).rows[0].female === 1);
secured('service role keeps board-state access', (await db.query('select public.board_is_open() as open')).rows[0].open === true);
await identity(1, 'password');
await rejected('password Auth session cannot query event counts', () => db.query('select * from public.gender_counts()'), 'ACCOUNT_NOT_ALLOWED');

await identity(0);
secured('valid participant sees only own event config', (await db.query('select event_id from public.session_config')).rows.length === 1);
await rejected('onboarding-free direct board RPC is rejected', () => db.query('select * from public.board_cards()'), 'ONBOARDING_INCOMPLETE');
secured('eligible card counts remain available', (await db.query('select * from public.gender_counts()')).rows[0].male === 1);
await db.query("select public.complete_onboarding('M',true,true)");
secured('onboarded participant without own card keeps existing board access', (await db.query('select * from public.board_cards()')).rows.some((card) => card.one_liner === 'female card'));

await owner();
await db.query('delete from auth.sessions where id=$1', [sessions[0]]);
await identity(0);
secured('revoked Auth session loses table access before token expiry', (await db.query('select * from public.session_config')).rows.length === 0);
await rejected('revoked Auth session loses aggregate RPC access', () => db.query('select * from public.gender_counts()'), 'ACCOUNT_NOT_ALLOWED');
await rejected('revoked Auth session loses board RPC access', () => db.query('select * from public.board_cards()'), 'ACCOUNT_NOT_ALLOWED');

await owner();
await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessions[0], A]);
const nextEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
await db.query("select public.activate_continuous_season($1,'opposite')", [nextEnd]);
await db.query('update public.session_config set force_locked=false where id=1');
await identity(0);
await rejected('season consent gate survives 0028 board patch', () => db.query('select * from public.board_cards()'), 'SEASON_CONSENT_REQUIRED');
await db.query("select public.accept_current_season($1,$2,'opposite')", [initialEvent, nextEnd]);
secured('unaccepted target stays absent from board', (await db.query('select * from public.board_cards()')).rows.length === 0);
await identity(2);
await db.query("select public.accept_current_season($1,$2,'opposite')", [initialEvent, nextEnd]);
await identity(0);
secured('accepted target appears after both parties consent', (await db.query('select * from public.board_cards()')).rows.some((card) => card.one_liner === 'female card'));

await owner();
await db.query('update public.users set retention_accepted_at=now() where id in ($1,$2)', [B, D]);
await db.query("select public.add_permanent_ban($1,'test',$2)", [emails[3], A]);
await db.query('select public.begin_event_purge($1,$2)', [initialEvent, purgeToken]);
await rejected('card creation is blocked while the event purge lease is active',
  () => db.query('select public.create_event_card($1,$2,$3,$4,$5,$6)',
    [initialEvent, A, 'late card', 'fixture_a', 'instagram', 'yellow']), 'PURGE_IN_PROGRESS');
await db.query('select public.purge_current_event_data($1,$2)', [initialEvent, purgeToken]);
const nextEvent = (await db.query('select public.finish_event_purge($1,$2) as event_id', [initialEvent, purgeToken])).rows[0].event_id;
await rejected('completed purge cannot be replayed for the next event',
  () => db.query('select public.begin_event_purge($1,$2)', [initialEvent, purgeToken]), 'STALE_EVENT');
secured('stale purge retry did not lock the next event',
  (await db.query('select purging from public.session_config where id=1')).rows[0].purging === false);
const retained = (await db.query('select id,banned,banned_reason from public.users where id=$1', [D])).rows[0];
secured('purge completes while retained permanent-ban account exists', nextEvent !== initialEvent);
secured('permanent ban persists across event purge', retained.banned && retained.banned_reason === 'permanent_ban');
await rejected('retained permanently banned account cannot enroll in new event',
  () => db.query('select * from public.register_event_participant($1,$2,$3,$4)', [nextEvent, D, emails[3], 'd'.repeat(64)]),
  'PERMANENTLY_BANNED');
secured('ordinary event ban resets after purge', (await db.query('select banned from public.users where id=$1', [A])).rows[0].banned === false);
const retainedBan = (await db.query("select public.add_permanent_ban($1,'retained-account test',$2) as user_id", [emails[1], A])).rows[0].user_id;
secured('administrator can permanently ban retained account without event ledger', retainedBan === B);
secured('retained account ban sets profile and ban record',
  (await db.query('select banned from public.users where id=$1', [B])).rows[0].banned === true
  && (await db.query('select email from public.permanent_bans where email=$1', [emails[1]])).rows.length === 1);
await rejected('newly banned retained account cannot enroll',
  () => db.query('select * from public.register_event_participant($1,$2,$3,$4)', [nextEvent, B, emails[1], 'b'.repeat(64)]),
  'PERMANENTLY_BANNED');

// Rejoining reuses the same Auth/profile UUID. The old page must never write
// to this new event just because that UUID became eligible again.
await db.query('select * from public.register_event_participant($1,$2,$3,$4)',
  [nextEvent, A, emails[0], 'a'.repeat(64)]);
await rejected('old page cannot create a card after purge and rejoin',
  () => db.query('select public.create_event_card($1,$2,$3,$4,$5,$6)',
    [initialEvent, A, 'stale card', 'fixture_a', 'instagram', 'yellow']), 'STALE_EVENT');
secured('old page did not create a card in the new event',
  (await db.query('select count(*)::int as total from public.cards where user_id=$1', [A])).rows[0].total === 0);

await db.query("update public.session_config set ends_at=now()-interval '1 minute' where id=1");
await rejected('card creation rechecks event end inside the locked write',
  () => db.query('select public.create_event_card($1,$2,$3,$4,$5,$6)',
    [nextEvent, A, 'expired card', 'fixture_a', 'instagram', 'yellow']), 'SESSION_ENDED');
await db.query("update public.session_config set ends_at=now()+interval '1 hour' where id=1");
const newCardId = (await db.query('select public.create_event_card($1,$2,$3,$4,$5,$6) as id',
  [nextEvent, A, 'new card', 'fixture_a', 'instagram', 'yellow'])).rows[0].id;
secured('rejoined participant can create a card in the current event', Boolean(newCardId));
await rejected('old page cannot edit or hide a new-event card',
  () => db.query('select public.update_event_card($1,$2,$3,$4,$5,$6,$7)',
    [initialEvent, A, 'stale edit', null, null, null, true]), 'STALE_EVENT');
const unchangedCard = (await db.query('select one_liner,hidden_by_user from public.cards where id=$1', [newCardId])).rows[0];
secured('rejected stale update leaves new-event card intact',
  unchangedCard.one_liner === 'new card' && unchangedCard.hidden_by_user === false);
await db.query('select public.update_event_card($1,$2,$3,$4,$5,$6,$7)',
  [nextEvent, A, 'current edit', null, null, null, true]);
const currentCard = (await db.query('select one_liner,hidden_by_user from public.cards where id=$1', [newCardId])).rows[0];
secured('current-event update still edits and hides the card',
  currentCard.one_liner === 'current edit' && currentCard.hidden_by_user === true);

console.log(`${checks} DB security checks passed`);
