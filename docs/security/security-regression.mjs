// Offline security regression: synthetic data only, no environment files or network.
// Uses the temporary PGlite install described in TEST-EVIDENCE.md.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
let checks = 0;
function secured(name, condition) {
  assert.ok(condition, name);
  console.log(`SECURED ${++checks}: ${name}`);
}

async function expectDbError(name, operation, message) {
  try {
    await operation();
    assert.fail(`${name}: expected database rejection`);
  } catch (error) {
    if (error?.code === 'ERR_ASSERTION') throw error;
    secured(name, String(error?.message).includes(message));
  }
}

await db.exec(`
  create role anon;
  create role authenticated;
  create role service_role bypassrls;
  create schema auth;
  create table auth.users(
    id uuid primary key,
    email text,
    email_confirmed_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select (nullif(current_setting('request.jwt.claims', true),'')::jsonb->>'sub')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select nullif(current_setting('request.jwt.claims', true),'')::jsonb $$;
  grant usage on schema public, auth to anon, authenticated, service_role;
  grant execute on all functions in schema auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  create schema cron;
  create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
`);

const migrationDir = new URL('../../supabase/migrations/', import.meta.url);
const migrations = (await readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort();
for (const file of migrations) {
  let sql = await readFile(new URL(file, migrationDir), 'utf8');
  sql = sql.replace(/create extension if not exists (pgcrypto|pg_cron);/g, '');
  await db.exec(sql);
}
secured('all migrations load on a clean participant database', migrations.at(-1)?.startsWith('0017_'));
const anonymousSessionPrivileges = (await db.query(`
  select
    has_table_privilege('anon', 'public.session_config', 'select') as config,
    has_function_privilege('anon', 'public.gender_counts()', 'execute') as counts,
    has_function_privilege('anon', 'public.board_is_open()', 'execute') as board_open
`)).rows[0];
secured(
  'anonymous clients cannot read session metadata or participant counts directly',
  !anonymousSessionPrivileges.config &&
    !anonymousSessionPrivileges.counts &&
    !anonymousSessionPrivileges.board_open,
);
const purgeDefinition = (await db.query(
  "select pg_get_functiondef('public.purge_current_event_data()'::regprocedure) as definition",
)).rows[0].definition.toLowerCase();
secured(
  'every event-purge delete has an explicit predicate for safeupdate deployments',
  [
    'delete from public.matches where id is not null',
    'delete from public.cards where id is not null',
    'delete from public.users where id is not null',
    'delete from public.banned_emails where email is not null',
    'delete from public.magic_link_throttle where key_hash is not null',
    'where event_id is not null and subject_key is not null',
  ].every((statement) => purgeDefinition.includes(statement)),
);

const A = '10000000-0000-4000-8000-000000000001';
const A2 = '10000000-0000-4000-8000-000000000006';
const B = '10000000-0000-4000-8000-000000000002';
const C = '10000000-0000-4000-8000-000000000003';
const D = '10000000-0000-4000-8000-000000000004';
const cardA = '20000000-0000-4000-8000-000000000001';
const cardB = '20000000-0000-4000-8000-000000000002';
const cardC = '20000000-0000-4000-8000-000000000003';
const cardD = '20000000-0000-4000-8000-000000000004';
const subjectA = 'a'.repeat(64);
const subjectB = 'b'.repeat(64);
const subjectC = 'c'.repeat(64);
const subjectD = 'd'.repeat(64);

async function owner() {
  await db.exec('reset role');
}

async function identity(id, email = 'fixture@cju.ac.kr', method = 'otp') {
  await owner();
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: id, email, amr: [{ method }], aal: 'aal1' }),
  ]);
  await db.exec('set role authenticated');
}

async function register(eventId, id, email, subjectKey) {
  await owner();
  return db.query('select * from public.register_event_participant($1,$2,$3,$4)', [
    eventId, id, email, subjectKey,
  ]);
}

await owner();
const eventId = (await db.query('select event_id from public.session_config where id=1')).rows[0].event_id;
await db.exec(`
  insert into auth.users(id,email,email_confirmed_at) values
    ('${A}','a@cju.ac.kr',now()),
    ('${B}','b@cju.ac.kr',now()),
    ('${C}','c@cju.ac.kr',now()),
    ('${D}','d@cju.ac.kr',now());
`);
await register(eventId, A, 'a@cju.ac.kr', subjectA);
await register(eventId, B, 'b@cju.ac.kr', subjectB);
await register(eventId, C, 'c@cju.ac.kr', subjectC);
await register(eventId, D, 'd@cju.ac.kr', subjectD);

await identity(A, 'a@cju.ac.kr');
await db.query('select public.complete_onboarding($1,$2,$3)', ['M', true, true]);
await owner();
const onboardedA = (await db.query(
  'select gender, terms_accepted_at, privacy_accepted_at from public.users where id=$1',
  [A],
)).rows[0];
secured(
  'an authenticated magic-link participant can complete onboarding once',
  onboardedA.gender === 'M' && onboardedA.terms_accepted_at && onboardedA.privacy_accepted_at,
);
await identity(A, 'a@cju.ac.kr');
await db.query('select public.complete_onboarding($1,$2,$3)', ['M', true, true]);
secured(
  'the same onboarding choice is idempotent after a lost response',
  (await db.query('select gender from public.users where id=$1', [A])).rows[0].gender === 'M',
);
await identity(A, 'a@cju.ac.kr');
await expectDbError(
  'onboarding cannot be replayed to change an immutable gender',
  () => db.query('select public.complete_onboarding($1,$2,$3)', ['F', true, true]),
  'GENDER_ALREADY_SET',
);
await owner();
await db.exec(`
  update public.users set gender='M' where id='${C}';
  update public.users set gender='F' where id in ('${B}','${D}');
  insert into public.cards(id,user_id,one_liner,instagram_id,color) values
    ('${cardA}','${A}','A','fixture_a','yellow'),
    ('${cardB}','${B}','B','fixture_b','pink'),
    ('${cardC}','${C}','C','fixture_c','blue'),
    ('${cardD}','${D}','D','fixture_d','green');
  update public.session_config
     set starts_at=now()-interval '1 hour', ends_at=now()+interval '1 hour',
         threshold_male=1, threshold_female=1, max_views_per_card=1, force_locked=false
   where id=1;
`);

await identity(A, 'a@cju.ac.kr');
secured(
  'first reveal succeeds for an eligible viewer and target',
  (await db.query('select * from public.consume_slot_and_reveal($1)', [cardB])).rows[0].instagram_id === 'fixture_b',
);

await identity(C, 'c@cju.ac.kr');
await expectDbError(
  'target capacity is durable and rejects a second viewer',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardB]),
  'CARD_FULL',
);

await owner();
await db.exec('update public.session_config set max_views_per_card=null where id=1');
secured(
  'a null card-view cap means the card is not full',
  (await db.query('select private.card_is_full($1) as full', [cardB])).rows[0].full === false,
);
await identity(C, 'c@cju.ac.kr');
secured(
  'multiple viewers may choose the same card when the optional cap is blank',
  (await db.query('select * from public.consume_slot_and_reveal($1)', [cardB])).rows[0].instagram_id === 'fixture_b',
);
await owner();
await db.query('select * from public.grant_event_slot($1)', [C]);
await db.exec('update public.session_config set max_views_per_card=1 where id=1');

await owner();
await db.query('delete from public.cards where id=$1', [cardB]);
await identity(A, 'a@cju.ac.kr');
await expectDbError(
  'deleting only a viewed card cannot restore the viewer slot',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardD]),
  'SLOT_ALREADY_USED',
);

await owner();
await db.query('delete from auth.users where id=$1', [B]);
await identity(A, 'a@cju.ac.kr');
await expectDbError(
  'deleting the viewed target cannot restore the viewer slot',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardD]),
  'SLOT_ALREADY_USED',
);

await owner();
await db.query('delete from auth.users where id=$1', [A]);
await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [A2, 'a@cju.ac.kr']);
const rejoined = await register(eventId, A2, 'a@cju.ac.kr', subjectA);
secured(
  'same-email re-registration relinks to the spent event ledger',
  rejoined.rows[0].used === 1 && rejoined.rows[0].remaining === 0,
);
await owner();
await db.query("update public.users set gender='M' where id=$1", [A2]);
await db.query(
  'insert into public.cards(id,user_id,one_liner,instagram_id,color) values ($1,$2,$3,$4,$5)',
  [cardA, A2, 'A2', 'fixture_a2', 'yellow'],
);
await identity(A2, 'a@cju.ac.kr');
await expectDbError(
  're-registered account cannot obtain a fresh default slot',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardD]),
  'SLOT_ALREADY_USED',
);

await owner();
const firstGrant = await db.query('select * from public.grant_event_slot($1)', [A2]);
const repeatedGrant = await db.query('select * from public.grant_event_slot($1)', [A2]);
secured(
  'repeated grant requests are idempotent while a bonus slot remains',
  firstGrant.rows[0].allowance === 2 && repeatedGrant.rows[0].allowance === 2,
);

await identity(A2, 'a@cju.ac.kr');
secured(
  'the explicitly granted bonus slot can be consumed once',
  (await db.query('select * from public.consume_slot_and_reveal($1)', [cardD])).rows[0].instagram_id === 'fixture_d',
);
await identity(C, 'c@cju.ac.kr');
await expectDbError(
  'target capacity remains enforced after a bonus reveal',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardD]),
  'CARD_FULL',
);

await owner();
await db.query('select public.ban_event_participant($1)', [A2]);
await db.query('update public.users set banned=true, banned_reason=$2 where id=$1', [A2, 'audit']);
await identity(A2, 'a@cju.ac.kr');
secured('banned participant receives no match details', (await db.query('select * from public.my_matches()')).rows.length === 0);
await expectDbError(
  'authenticated clients cannot directly update card content',
  () => db.query("update public.cards set one_liner='bypass' where user_id=$1", [A2]),
  'permission denied',
);

await owner();
await db.query("update auth.users set email='external@example.invalid' where id=$1", [C]);
await identity(C, 'external@example.invalid');
secured(
  'an Auth email changed outside the school domain fails the DB session boundary',
  (await db.query('select * from public.my_slot_state()')).rows.length === 0,
);

await owner();
const beforePurge = (await db.query('select * from public.event_purge_status()')).rows[0];
secured('purge status includes the durable participant ledger', beforePurge.participants === 4);
await db.query('select public.begin_event_purge()');
await db.query('select public.purge_current_event_data()');
const empty = (await db.query('select * from public.event_purge_status()')).rows[0];
secured(
  'event purge removes profiles, cards, matches, bans, throttles, and ledger rows',
  Object.values(empty).every((value) => value === 0),
);
const nextEventId = (await db.query('select public.finish_event_purge() as id')).rows[0].id;
secured('finishing a purge rotates the event identifier', nextEventId !== eventId);

const nextSubjectA = 'e'.repeat(64);
const nextRegistration = await register(nextEventId, A2, 'a@cju.ac.kr', nextSubjectA);
secured(
  'a new event starts the same participant with one unused slot',
  nextRegistration.rows[0].allowance === 1 && nextRegistration.rows[0].used === 0,
);

console.log(`Completed ${checks} security regression checks.`);
await db.close();
