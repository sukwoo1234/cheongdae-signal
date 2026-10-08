// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const sql = (name: string) => readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8");
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const card = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
const query = async (s: string) => (await db.query<Record<string, any>>(s)).rows;
const actor = (n: number) => db.exec(`select set_config('test.uid','${uid(n)}',false)`);
const activate = () => db.exec("select public.activate_continuous_season(now()+interval '120 days','selectable')");
const accept = () => db.exec("select public.accept_current_season(event_id,ends_at,board_mode) from public.session_config");

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('test.uid',true),'')::uuid $$;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create table public.users(id uuid primary key references auth.users(id) on delete cascade,
      email text not null, gender text, banned boolean default false, terms_accepted_at timestamptz,
      privacy_accepted_at timestamptz,last_active_at timestamptz);
    create table public.cards(id uuid primary key default gen_random_uuid(),
      user_id uuid unique references public.users(id) on delete cascade, one_liner text,instagram_id text,
      color text,hidden_by_user boolean default false,hidden_by_admin boolean default false);
    create table public.matches(id uuid primary key default gen_random_uuid(),
      viewer_user_id uuid references public.users(id) on delete cascade,
      viewed_card_id uuid references public.cards(id) on delete cascade,
      bonus boolean default false,created_at timestamptz default now(),unique(viewer_user_id,viewed_card_id));
    create table public.session_config(id int primary key,event_id uuid,
      starts_at timestamptz default now()-interval '1 day',ends_at timestamptz default now()+interval '7 days',
      force_locked boolean default false,purging boolean default false,
      threshold_male int default 5,threshold_female int default 3,max_views_per_card int);
    create table private.event_participants(event_id uuid,subject_key text,current_user_id uuid
      references public.users(id) on delete set null,allowance int default 1 check(allowance>=0),
      used int default 0 check(used>=0 and used<=allowance), received_reveals int default 0,banned boolean default false,
      primary key(event_id,subject_key),unique(event_id,current_user_id));
    create table public.banned_emails(email text);
    create table public.magic_link_throttle(window_start timestamptz);
    create table public.permanent_bans(expires_at timestamptz);
    create function private.app_actor_active() returns boolean language sql stable as $$
      select exists(select 1 from public.users u join private.event_participants ep on ep.current_user_id=u.id
        join public.session_config c on c.event_id=ep.event_id and not c.purging
        where u.id=auth.uid() and not u.banned and not ep.banned) $$;
    create function private.gender_of(p_user_id uuid) returns text language sql stable as $$
      select u.gender from public.users u join private.event_participants ep on ep.current_user_id=u.id
        join public.session_config c on c.event_id=ep.event_id and not c.purging
        where u.id=p_user_id and not u.banned and not ep.banned $$;
    create function private.card_is_full(p_id uuid) returns boolean language sql stable as $$
      select coalesce(ep.received_reveals>=c.max_views_per_card,false) from public.cards card
        join private.event_participants ep on ep.current_user_id=card.user_id
        join public.session_config c on c.event_id=ep.event_id where card.id=p_id $$;
    create function public.board_is_open() returns boolean language sql stable as $$select false$$;
    create function public.gender_counts() returns table(male int,female int) language sql stable as $$select 0,0$$;
    create function public.my_slot_state() returns table(allowance int,used int,remaining int)
      language sql as $$select 1,0,1$$;
    insert into public.session_config(id,event_id) values(1,'30000000-0000-4000-8000-000000000001');
  `);
  await db.exec(sql("0022_selectable_board_mode.sql"));
}, 20_000);

afterEach(async () => { await db?.close(); });

async function setup() {
  await db.exec(sql("0023_sync_existing_participant_allowance.sql"));
  await db.exec(sql("0025_contact_method_types.sql"));
  // Seed a populated legacy event, not an empty test installation.
  for (let n=1;n<=6;n++) {
    await db.exec(`insert into auth.users values('${uid(n)}','student${n}@cju.ac.kr',now());
      insert into public.users(id,email,gender) values('${uid(n)}','student${n}@cju.ac.kr','${n<=4 ? "M":"F"}');
      insert into private.event_participants(event_id,subject_key,current_user_id)
        select event_id,lpad('${n}',64,'0'),'${uid(n)}'::uuid from public.session_config;
      insert into public.cards(id,user_id,one_liner,instagram_id,contact_type,color)
        values('${card(n)}','${uid(n)}','테스트 ${n}','student${n}','instagram','pink');`);
  }
  await db.exec(sql("0027_continuous_seasons.sql"));
  await actor(1);
}

async function openWithConsent() {
  await setup(); await activate();
  for(let n=1;n<=6;n++) { await actor(n); await accept(); }
  await actor(1);
  await db.exec("update public.session_config set force_locked=false");
}

describe("continuous season conversion", () => {
  it("does not change legacy event data before explicit activation", async () => {
    await setup();
    expect(await query("select continuous_mode,board_mode,force_locked,base_selection_allowance from public.session_config"))
      .toEqual([{continuous_mode:false,board_mode:"opposite",force_locked:false,base_selection_allowance:1}]);
    expect(await query("select count(*)::int n from public.cards")).toEqual([{n:6}]);
  });

  it("preserves cards and identity, switches to existing selectable mode, locks until manually opened", async () => {
    await setup();
    const before = await query("select id,user_id,instagram_id from public.cards order by id");
    const event = await query("select event_id from public.session_config");
    await activate();
    expect(await query("select id,user_id,instagram_id from public.cards order by id")).toEqual(before);
    expect(await query("select event_id from public.session_config")).toEqual(event);
    expect(await query("select continuous_mode,board_mode,base_selection_allowance,force_locked from public.session_config"))
      .toEqual([{continuous_mode:true,board_mode:"selectable",base_selection_allowance:2,force_locked:true}]);
    expect(await query("select distinct allowance,season_accepted_at from private.event_participants"))
      .toEqual([{allowance:2,season_accepted_at:null}]);
    expect(await query("select public.board_is_open() open")).toEqual([{open:false}]);
  });

  it("rejects an audience change after any selection and never changes the old state", async () => {
    await setup();
    await db.exec(`update private.event_participants set used=1 where current_user_id='${uid(1)}'`);
    await expect(activate()).rejects.toThrow("SEASON_HAS_SELECTIONS");
    expect(await query("select continuous_mode from public.session_config")).toEqual([{continuous_mode:false}]);
  });

  it("requires explicit consent and shows both tabs only for consented participants", async () => {
    await setup(); await activate();
    const [legacyState] = await query("select * from public.my_season_state()");
    expect(legacyState.accepted).toBe(false);
    expect(new Date(legacyState.participation_ends_at).getTime()).toBeLessThan(new Date(legacyState.ends_at).getTime());
    await db.exec("update public.session_config set force_locked=false");
    expect(await query("select public.board_is_open() open")).toEqual([{open:true}]);
    await expect(db.exec("select * from public.board_cards('M')")).rejects.toThrow("SEASON_CONSENT_REQUIRED");
    await expect(db.exec("select public.accept_current_season(event_id,ends_at,'opposite') from public.session_config"))
      .rejects.toThrow("SEASON_CHANGED");
    await accept();
    expect(await query("select * from public.board_cards('M')")).toEqual([]);
    await actor(2); await accept(); await actor(5); await accept(); await actor(1);
    expect((await query("select * from public.board_cards('M')")).map(r=>r.id)).toEqual([card(2)]);
    expect((await query("select * from public.board_cards('F')")).map(r=>r.id)).toEqual([card(5)]);
    expect(await query("select * from public.gender_counts()")).toEqual([{male:2,female:1}]);
    await expect(db.exec("update public.session_config set ends_at=ends_at+interval '1 day'"))
      .rejects.toThrow("SEASON_RULES_LOCKED");
  });

  it("shares two choices across tabs and preserves cumulative numbers after weekly refills", async () => {
    await openWithConsent();
    await db.exec(`select * from public.consume_slot_and_reveal('${card(2)}');
      select * from public.consume_slot_and_reveal('${card(5)}');`);
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:2,remaining:0,base_remaining:0});
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(3)}')`)).rejects.toThrow("SLOT_ALREADY_USED");
    // Existing ledger resembles last week's used-up allowance. Lazy read catches up once.
    await db.exec(`update private.event_participants set week_started_at=week_started_at-interval '7 days' where current_user_id='${uid(1)}'`);
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:2,remaining:2,base_remaining:2});
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:2,remaining:2});
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(2)}')`)).rejects.toThrow("CARD_ALREADY_VIEWED");
    await db.exec(`select * from public.consume_slot_and_reveal('${card(3)}')`);
    expect((await query("select * from public.my_matches()")).map(r=>r.selection_number)).toEqual([3,2,1]);
    expect((await query(`select * from public.admin_event_participant_state('${uid(1)}')`))[0]).toMatchObject({used:3,remaining:1});
    expect(await query("select sum(used)::int n from private.event_participants")).toEqual([{n:3}]);
  });

  it("does not accumulate missed weeks and preserves unspent administrator bonus separately", async () => {
    await openWithConsent();
    await db.exec(`select * from public.consume_slot_and_reveal('${card(2)}');
      select * from public.consume_slot_and_reveal('${card(5)}');
      select * from public.grant_event_slot('${uid(1)}');
      update private.event_participants set week_started_at=week_started_at-interval '28 days' where current_user_id='${uid(1)}';`);
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:2,remaining:3,base_remaining:2,bonus_remaining:1});
    await db.exec(`select * from public.consume_slot_and_reveal('${card(3)}');
      select * from public.consume_slot_and_reveal('${card(4)}');
      select * from public.consume_slot_and_reveal('${card(6)}');`);
    expect((await query("select * from public.my_matches()"))[0]).toMatchObject({selection_number:5,bonus:true});
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:5,remaining:0,bonus_remaining:0});
  });

  it("uses the exact Korean Monday midnight boundary", async () => {
    await setup();
    const [r] = await query(`select
      private.season_week('2026-10-11T14:59:59Z')::text before,
      private.season_week('2026-10-11T15:00:00Z')::text after`);
    expect(new Date(r.before).toISOString()).toBe("2026-10-04T15:00:00.000Z");
    expect(new Date(r.after).toISOString()).toBe("2026-10-11T15:00:00.000Z");
  });

  it("gives new entrants two choices and requires consent before their card is exposed", async () => {
    await openWithConsent();
    await db.exec(`insert into auth.users values('${uid(7)}','student7@cju.ac.kr',now());
      insert into public.users(id,email,gender) values('${uid(7)}','student7@cju.ac.kr','F');
      insert into private.event_participants(event_id,subject_key,current_user_id)
        select event_id,lpad('7',64,'0'),'${uid(7)}'::uuid from public.session_config;
      insert into public.cards(id,user_id,one_liner,instagram_id,contact_type,color)
        values('${card(7)}','${uid(7)}','new','student7','kakao','pink');`);
    expect((await query("select * from public.board_cards('F')")).map(r=>r.id)).not.toContain(card(7));
    await actor(7);
    const [newState] = await query("select * from public.my_season_state()");
    expect(newState.accepted).toBe(false);
    expect(new Date(newState.participation_ends_at).getTime()).toBe(new Date(newState.ends_at).getTime());
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:0,remaining:2,base_remaining:2});
    await accept(); await actor(1);
    expect((await query("select * from public.board_cards('F')")).map(r=>r.id)).toContain(card(7));
  });

  it("refills a partially unused base allowance to two, not by two", async () => {
    await openWithConsent();
    await db.exec(`select * from public.consume_slot_and_reveal('${card(2)}');
      update private.event_participants set week_started_at=week_started_at-interval '7 days' where current_user_id='${uid(1)}';`);
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:1,remaining:2,base_remaining:2});
  });

  it("does not refill by reaccepting consent, hiding, or editing a card", async () => {
    await openWithConsent();
    await db.exec(`select * from public.consume_slot_and_reveal('${card(2)}');
      update public.cards set one_liner='수정',hidden_by_user=true where user_id='${uid(1)}';
      update public.cards set hidden_by_user=false where user_id='${uid(1)}';`);
    await accept(); await accept();
    expect((await query("select * from public.my_slot_state()"))[0]).toMatchObject({used:1,remaining:1});
  });

  it("closes board and contact history at the season end", async () => {
    await openWithConsent();
    await db.exec(`select * from public.consume_slot_and_reveal('${card(2)}');
      alter table public.session_config disable trigger session_config_lock_started_rules;
      update public.session_config set ends_at=now()-interval '1 second';
      alter table public.session_config enable trigger session_config_lock_started_rules;`);
    expect(await query("select public.board_is_open() open")).toEqual([{open:false}]);
    expect(await query("select * from public.my_matches()")).toEqual([]);
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(3)}')`)).rejects.toThrow("BOARD_CLOSED");
    expect(await query("select count(*)::int n from public.matches")).toEqual([{n:1}]);
  });

  it("keeps hidden flags and previous deletion deadlines for participants who do not consent", async () => {
    await setup();
    await db.exec(`update public.cards set hidden_by_user=true where user_id='${uid(1)}';
      update public.session_config set ends_at=now()-interval '8 days'`);
    await activate(); await accept();
    await db.exec("select public.session_tick()");
    expect(await query("select user_id,hidden_by_user from public.cards")).toEqual([{user_id:uid(1),hidden_by_user:true}]);
    expect(await query("select count(*)::int n from public.users")).toEqual([{n:6}]);
    expect(await query("select count(*)::int n from private.event_participants")).toEqual([{n:1}]);
  });

  it("keeps lock, expiry, hidden cards and self-selection boundaries", async () => {
    await openWithConsent();
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(1)}')`)).rejects.toThrow("CANNOT_VIEW_OWN_CARD");
    await db.exec(`update public.cards set hidden_by_user=true where id='${card(2)}'`);
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(2)}')`)).rejects.toThrow("CARD_HIDDEN");
    await db.exec("update public.session_config set force_locked=true");
    await expect(db.exec(`select * from public.consume_slot_and_reveal('${card(3)}')`)).rejects.toThrow("BOARD_CLOSED");
    const state = await query("select allowance,used from private.event_participants order by subject_key");
    await db.exec("select private.refresh_season_slots(null,now()+interval '200 days')");
    expect(await query("select allowance,used from private.event_participants order by subject_key")).toEqual(state);
  });

  it("restricts activation and private clock overrides to trusted administration", async () => {
    await setup();
    const [r] = await query(`select
      has_function_privilege('anon','public.my_season_state()','execute') anon_read,
      has_function_privilege('authenticated','public.activate_continuous_season(timestamptz,text)','execute') activate,
      has_function_privilege('authenticated','private.refresh_season_slots(uuid,timestamptz)','execute') clock,
      has_function_privilege('service_role','public.activate_continuous_season(timestamptz,text)','execute') admin`);
    expect(r).toEqual({anon_read:false,activate:false,clock:false,admin:true});
  });
});
