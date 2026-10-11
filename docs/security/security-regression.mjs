// Offline security regression: synthetic data only, no environment files or network.
// Uses the temporary PGlite install described in TEST-EVIDENCE.md.
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';

const db = new PGlite();
const purgeToken = '90000000-0000-4000-8000-000000000001';
const otherPurgeToken = '90000000-0000-4000-8000-000000000002';
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
  create table auth.sessions(
    id uuid primary key,
    user_id uuid not null references auth.users(id) on delete cascade,
    not_after timestamptz
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
secured('all migrations load on a clean participant database', migrations.length > 0);
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
  "select pg_get_functiondef('public.purge_current_event_data(uuid,uuid)'::regprocedure) as definition",
)).rows[0].definition.toLowerCase();
secured(
  'every event-purge delete has an explicit predicate for safeupdate deployments',
  [
    'delete from public.matches where id is not null',
    'delete from public.cards where id is not null',
    'delete from public.banned_emails where email is not null',
    'delete from public.magic_link_throttle where key_hash is not null',
    'where event_id is not null and subject_key is not null',
  ].every((statement) => purgeDefinition.includes(statement)),
);

const A = '10000000-0000-4000-8000-000000000001';
const A2 = '10000000-0000-4000-8000-000000000006';
const A3 = '10000000-0000-4000-8000-000000000007';
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

function sessionId(id) {
  return `30000000${id.slice(8)}`;
}

async function identity(id, email = 'fixture@cju.ac.kr', method = 'otp', extraClaims = {}) {
  await owner();
  await db.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({
      sub: id, email, amr: [{ method }], aal: 'aal1',
      role: 'authenticated', session_id: sessionId(id), ...extraClaims,
    }),
  ]);
  await db.exec('set role authenticated');
}

async function register(eventId, id, email, subjectKey) {
  await owner();
  const result = await db.query('select * from public.register_event_participant($1,$2,$3,$4)', [
    eventId, id, email, subjectKey,
  ]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict do nothing', [
    sessionId(id), id,
  ]);
  return result;
}

async function serviceQuery(sql, params = []) {
  await owner();
  await db.query("select set_config('request.jwt.claims', '{}', false)");
  await db.exec('set role service_role');
  try {
    return await db.query(sql, params);
  } finally {
    await owner();
  }
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
`);
const countsWithoutCards = (await serviceQuery('select * from public.gender_counts()')).rows[0];
secured(
  'onboarded users without cards do not count toward board opening',
  countsWithoutCards.male === 0 && countsWithoutCards.female === 0,
);
await db.exec(`
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
const visibleCardCounts = (await serviceQuery('select * from public.gender_counts()')).rows[0];
secured(
  'visible completed cards count toward board opening by gender',
  visibleCardCounts.male === 2 && visibleCardCounts.female === 2,
);
await db.query('update public.cards set hidden_by_admin=true where id=$1', [cardA]);
const countsWithHiddenCard = (await serviceQuery('select * from public.gender_counts()')).rows[0];
secured(
  'hidden cards do not count toward board opening',
  countsWithHiddenCard.male === 1 && countsWithHiddenCard.female === 2,
);
await db.query('update public.cards set hidden_by_admin=false where id=$1', [cardA]);

secured(
  'service-role requests without participant JWTs can read administrator session metadata',
  (await serviceQuery('select * from public.session_config')).rows.length === 1 &&
    (await serviceQuery('select public.board_is_open() as open')).rows[0].open === true,
);

await identity(A, 'a@cju.ac.kr');
const participantBoard = (await db.query('select * from public.board_cards()')).rows;
secured(
  'a valid school participant can read metadata and the opposite-gender board',
  (await db.query('select * from public.session_config')).rows.length === 1 &&
    (await db.query('select * from public.gender_counts()')).rows[0].male === 2 &&
    (await db.query('select public.board_is_open() as open')).rows[0].open === true &&
    participantBoard.length === 2 && participantBoard.every((row) => row.gender === 'F'),
);

async function expectParticipantBlocked(label) {
  secured(
    `${label}: profiles, cards, contacts and session metadata are inaccessible`,
    (await db.query('select private.app_actor_active() as active')).rows[0].active === false &&
      (await db.query('select * from public.users')).rows.length === 0 &&
      (await db.query('select * from public.my_card()')).rows.length === 0 &&
      (await db.query('select * from public.my_matches()')).rows.length === 0 &&
      (await db.query('select * from public.session_config')).rows.length === 0,
  );
  for (const [name, sql] of [
    ['participant counts', 'select * from public.gender_counts()'],
    ['board state', 'select public.board_is_open()'],
    ['board cards', 'select * from public.board_cards()'],
    ['slot state', 'select * from public.my_slot_state()'],
    ['new contact reveal', `select * from public.consume_slot_and_reveal('${cardB}')`],
    ['onboarding', "select public.complete_onboarding('M',true,true)"],
  ]) {
    await expectDbError(`${label}: ${name} is rejected`, () => db.query(sql), 'ACCOUNT_NOT_ALLOWED');
  }
}

await owner();
await db.query("select set_config('request.jwt.claims', '{}', false)");
await db.exec('set role anon');
for (const [name, sql] of [
  ['session metadata', 'select * from public.session_config'],
  ['participant counts', 'select * from public.gender_counts()'],
  ['board state', 'select public.board_is_open()'],
]) {
  await expectDbError(`anonymous callers cannot read ${name}`, () => db.query(sql), 'permission denied');
}

const externalUser = '10000000-0000-4000-8000-000000000010';
const unregisteredStudent = '10000000-0000-4000-8000-000000000011';
await owner();
await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now()),($3,$4,now())', [
  externalUser, 'external@example.invalid', unregisteredStudent, 'unregistered@cju.ac.kr',
]);
await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4)', [
  sessionId(externalUser), externalUser, sessionId(unregisteredStudent), unregisteredStudent,
]);
await identity(externalUser, 'external@example.invalid', 'password', { role: 'service_role' });
await expectParticipantBlocked('external password account, even with a forged JWT role claim');
await identity(externalUser, 'external@example.invalid');
await expectParticipantBlocked('external OTP account');
await identity(unregisteredStudent, 'unregistered@cju.ac.kr');
await expectParticipantBlocked('school account without an event registration');
await identity(C, 'c@cju.ac.kr', 'password');
await expectParticipantBlocked('registered participant using a password session');

for (const [label, value] of [
  ['missing session identifier', null],
  ['malformed session identifier', 'not-a-uuid'],
  ["another participant's session identifier", sessionId(A)],
]) {
  await identity(C, 'c@cju.ac.kr', 'otp', { session_id: value });
  await expectParticipantBlocked(label);
}
await owner();
await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1", [sessionId(C)]);
await identity(C, 'c@cju.ac.kr');
await expectParticipantBlocked('expired Auth session');
await owner();
await db.query('delete from auth.sessions where id=$1', [sessionId(C)]);
await identity(C, 'c@cju.ac.kr');
await expectParticipantBlocked('logged-out participant with an unused selection');
await owner();
secured(
  'rejected contact requests do not consume a selection',
  (await db.query('select used from private.event_participants where current_user_id=$1', [C])).rows[0].used === 0,
);
await db.query("insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 hour')", [sessionId(C), C]);
await identity(C, 'c@cju.ac.kr');
secured('a new unexpired Auth session restores participant access', (await db.query('select private.app_actor_active() as active')).rows[0].active);

await owner();
await identity(C, 'c@cju.ac.kr');
await expectDbError(
  'a gender value alone cannot bypass the required onboarding consent',
  () => db.query('select * from public.board_cards()'),
  'ONBOARDING_INCOMPLETE',
);
await owner();
await db.query('update public.users set gender=null where id=$1', [C]);
await identity(C, 'c@cju.ac.kr');
await expectDbError(
  'the opposite-gender board cannot be previewed before onboarding',
  () => db.query('select * from public.board_cards()'),
  'ONBOARDING_INCOMPLETE',
);
await db.query("select public.complete_onboarding('M',true,true)");

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
await identity(A, 'a@cju.ac.kr');
secured(
  'a participant can read saved match details while the event is active',
  (await db.query('select * from public.my_matches()')).rows[0].instagram_id === 'fixture_b',
);
await owner();
await db.query('delete from auth.sessions where id=$1', [sessionId(A)]);
await identity(A, 'a@cju.ac.kr');
await expectParticipantBlocked('logged-out participant with an existing match');
await owner();
await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [sessionId(A), A]);
await owner();
secured(
  'the admin cumulative match count uses the durable anonymous event ledger',
  (await db.query('select public.admin_event_match_count() as n')).rows[0].n === 2,
);
await owner();
await db.exec("update public.session_config set ends_at=now()-interval '1 second' where id=1");
await identity(A, 'a@cju.ac.kr');
secured(
  'saved match details are unavailable immediately after the event ends',
  (await db.query('select * from public.my_matches()')).rows.length === 0,
);
await owner();
await db.exec("update public.session_config set ends_at=now()+interval '1 hour' where id=1");
await identity(A, 'a@cju.ac.kr');
secured(
  'extending an unpurged event restores saved match access',
  (await db.query('select * from public.my_matches()')).rows[0].instagram_id === 'fixture_b',
);
await owner();
await db.query('select * from public.grant_event_slot($1)', [C]);
await db.exec('update public.session_config set max_views_per_card=1 where id=1');

await owner();
await db.query('delete from public.cards where id=$1', [cardB]);
secured(
  'deleting a selected card removes match details without reducing the cumulative count',
  (await db.query('select count(*)::int as n from public.matches')).rows[0].n === 0 &&
  (await db.query('select public.admin_event_match_count() as n')).rows[0].n === 2,
);
await identity(A, 'a@cju.ac.kr');
await expectDbError(
  'deleting only a viewed card cannot restore the viewer slot',
  () => db.query('select * from public.consume_slot_and_reveal($1)', [cardD]),
  'SLOT_ALREADY_USED',
);

await owner();
await db.query('delete from auth.users where id=$1', [B]);
const afterDeparture = (await db.query('select * from public.event_purge_status()')).rows[0];
secured(
  'a deleted account reduces current users without reducing cumulative participants',
  afterDeparture.participants === 4 && afterDeparture.users === 3,
);
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
await expectParticipantBlocked('banned participant with a valid Auth session');
await expectDbError(
  'authenticated clients cannot directly update card content',
  () => db.query("update public.cards set one_liner='bypass' where user_id=$1", [A2]),
  'permission denied',
);

await owner();
await db.query('delete from auth.users where id=$1', [A2]);
await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [A3, 'a@cju.ac.kr']);
await expectDbError(
  'an event-blocked email cannot rejoin after its Auth account is deleted',
  () => register(eventId, A3, 'a@cju.ac.kr', subjectA),
  'PARTICIPANT_BANNED',
);

await owner();
await db.query("update auth.users set email='external@example.invalid' where id=$1", [C]);
await identity(C, 'external@example.invalid');
await expectDbError(
  'an Auth email changed outside the school domain fails the DB session boundary',
  () => db.query('select * from public.my_slot_state()'),
  'ACCOUNT_NOT_ALLOWED',
);

await owner();
const beforePurge = (await db.query('select * from public.event_purge_status()')).rows[0];
secured('purge status includes the durable participant ledger', beforePurge.participants === 4);
await db.query('select public.begin_event_purge($1,$2)', [eventId, purgeToken]);
await expectDbError('a second worker cannot claim the active event purge',
  () => db.query('select public.begin_event_purge($1,$2)', [eventId, otherPurgeToken]),
  'PURGE_BUSY');
await expectDbError('a worker without the claim cannot delete event data',
  () => db.query('select public.purge_current_event_data($1,$2)', [eventId, otherPurgeToken]),
  'PURGE_LEASE_LOST');
await db.query('select public.purge_current_event_data($1,$2)', [eventId, purgeToken]);
const empty = (await db.query('select * from public.event_purge_status()')).rows[0];
secured(
  'event purge removes cards, matches, event bans, throttles, and ledger rows',
  empty.matches === 0 && empty.cards === 0 && empty.banned_emails === 0 &&
    empty.throttles === 0 && empty.participants === 0,
);
const nextEventId = (await db.query('select public.finish_event_purge($1,$2) as id', [eventId, purgeToken])).rows[0].id;
secured('finishing a purge rotates the event identifier', nextEventId !== eventId);
await expectDbError(
  'a completed purge request cannot start a purge of the next event',
  () => db.query('select public.begin_event_purge($1,$2)', [eventId, purgeToken]),
  'STALE_EVENT',
);
secured('the next event remains open after a stale purge retry',
  (await db.query('select purging from public.session_config where id=1')).rows[0].purging === false);

const nextSubjectA = 'e'.repeat(64);
const nextRegistration = await register(nextEventId, A3, 'a@cju.ac.kr', nextSubjectA);
secured(
  'a new event starts the same participant with one unused slot',
  nextRegistration.rows[0].allowance === 1 && nextRegistration.rows[0].used === 0,
);

await owner();
const permanentPrivileges = (await db.query(`
  select has_table_privilege('anon', 'public.permanent_bans', 'select') as anon_read,
         has_table_privilege('authenticated', 'public.permanent_bans', 'select') as user_read
`)).rows[0];
secured('permanent-ban emails are not readable by participants', !permanentPrivileges.anon_read && !permanentPrivileges.user_read);

const banResult = await db.query('select public.add_permanent_ban($1,$2,$3) as id', [
  'A@CJU.AC.KR', 'confirmed abuse', A,
]);
secured(
  'permanent ban also blocks the active event participant',
  banResult.rows[0].id === A3 &&
  (await db.query('select banned from public.users where id=$1', [A3])).rows[0].banned === true &&
  (await db.query('select banned from private.event_participants where current_user_id=$1', [A3])).rows[0].banned === true,
);
secured(
  'permanent ban creates a durable email record',
  (await db.query('select reason from public.permanent_bans where email=$1', ['a@cju.ac.kr'])).rows[0].reason === 'confirmed abuse',
);
secured(
  'releasing a permanent ban does not undo the event ban',
  (await db.query('select public.release_permanent_ban($1) as released', ['a@cju.ac.kr'])).rows[0].released === true &&
  (await db.query('select email from public.banned_emails where email=$1', ['a@cju.ac.kr'])).rows.length === 1,
);

await db.query('select public.add_permanent_ban($1,$2,$3)', ['a@cju.ac.kr', 'confirmed abuse', A]);
await db.query('select public.begin_event_purge($1,$2)', [nextEventId, purgeToken]);
await db.query('select public.purge_current_event_data($1,$2)', [nextEventId, purgeToken]);
const thirdEventId = (await db.query('select public.finish_event_purge($1,$2) as id', [nextEventId, purgeToken])).rows[0].id;
secured(
  'event purge retains only the separate permanent ban',
  (await db.query('select count(*)::int as n from public.permanent_bans')).rows[0].n === 1 &&
  (await db.query('select count(*)::int as n from public.banned_emails')).rows[0].n === 0,
);
await expectDbError(
  'a permanently banned email cannot register in the next event',
  () => register(thirdEventId, A3, 'a@cju.ac.kr', 'f'.repeat(64)),
  'PERMANENTLY_BANNED',
);
await owner();
await db.query('select public.release_permanent_ban($1)', ['a@cju.ac.kr']);
secured(
  'release permits registration in a future event',
  (await register(thirdEventId, A3, 'a@cju.ac.kr', 'f'.repeat(64))).rows[0].remaining === 1,
);

await owner();
await db.query('select public.add_permanent_ban($1,$2,$3)', ['a@cju.ac.kr', 'confirmed abuse', A]);
secured(
  'cross-event ban expires six calendar months after creation',
  (await db.query(`
    select expires_at = created_at + interval '6 months' as correct
      from public.permanent_bans where email=$1
  `, ['a@cju.ac.kr'])).rows[0].correct === true,
);
await db.query("update public.permanent_bans set expires_at=now()-interval '1 second' where email=$1", ['a@cju.ac.kr']);
secured(
  'expired cross-event ban does not lift the current event ban',
  (await db.query('select count(*)::int as n from public.banned_emails where email=$1', ['a@cju.ac.kr'])).rows[0].n === 1,
);
await db.query('select public.begin_event_purge($1,$2)', [thirdEventId, purgeToken]);
await db.query('select public.purge_current_event_data($1,$2)', [thirdEventId, purgeToken]);
const fourthEventId = (await db.query('select public.finish_event_purge($1,$2) as id', [thirdEventId, purgeToken])).rows[0].id;
secured(
  'an expired ban cannot block a new event even before cleanup runs',
  (await register(fourthEventId, A3, 'a@cju.ac.kr', '0'.repeat(64))).rows[0].remaining === 1,
);
await owner();
await db.query('select public.session_tick()');
secured(
  'scheduled session tick deletes the expired email and reason',
  (await db.query('select count(*)::int as n from public.permanent_bans')).rows[0].n === 0,
);

console.log(`Completed ${checks} security regression checks.`);
await db.close();
