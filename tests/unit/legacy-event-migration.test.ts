import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migrationDir = resolve(process.cwd(), "supabase", "migrations");
const migrations = readdirSync(migrationDir).filter((file) => file.endsWith(".sql")).sort();

describe("legacy event migration", () => {
  it("keeps existing accounts, cards, matches and event records through 0029 without assuming retention consent", async () => {
    const db = new PGlite();
    try {
      await db.exec(`
        create role anon;
        create role authenticated;
        create role service_role bypassrls;
        create schema auth;
        create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
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
        create function cron.schedule(text, text, text) returns bigint
          language sql as $$ select 1::bigint $$;
      `);

      const apply = async (file: string) => {
        const sql = readFileSync(resolve(migrationDir, file), "utf8")
          .replace(/create extension if not exists (pgcrypto|pg_cron);/g, "");
        await db.exec(sql);
      };
      for (const file of migrations.filter((name) => name < "0024")) await apply(file);

      const actor = "10000000-0000-4000-8000-000000000001";
      const target = "10000000-0000-4000-8000-000000000002";
      const actorCard = "20000000-0000-4000-8000-000000000001";
      const targetCard = "20000000-0000-4000-8000-000000000002";
      const match = "40000000-0000-4000-8000-000000000001";
      const session = "30000000-0000-4000-8000-000000000001";
      const eventId = (await db.query<{ event_id: string }>(
        "select event_id from public.session_config where id=1",
      )).rows[0].event_id;

      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,'actor@cju.ac.kr',now()),($2,'target@cju.ac.kr',now())",
        [actor, target],
      );
      await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [session, actor]);
      await db.query(
        `insert into public.users(id,email,gender,terms_accepted_at,privacy_accepted_at)
         values($1,'actor@cju.ac.kr','M',now(),now()),($2,'target@cju.ac.kr','F',now(),now())`,
        [actor, target],
      );
      await db.query(
        `insert into private.event_participants
           (event_id,subject_key,current_user_id,used,received_reveals)
         values($1,$2,$3,1,0),($1,$4,$5,0,1)`,
        [eventId, "a".repeat(64), actor, "b".repeat(64), target],
      );
      await db.query(
        `insert into public.cards
           (id,user_id,one_liner,instagram_id,color,created_at,updated_at)
         values
           ($1,$2,'전화 카드','01012345678','yellow','2025-01-01T00:00:00Z','2025-01-02T00:00:00Z'),
           ($3,$4,'아이디 카드','fixture_ig','pink','2025-01-03T00:00:00Z','2025-01-04T00:00:00Z')`,
        [actorCard, actor, targetCard, target],
      );
      await db.query(
        `insert into public.matches(id,viewer_user_id,viewed_card_id,bonus,selection_number,created_at)
         values($1,$2,$3,false,1,'2025-01-05T00:00:00Z')`,
        [match, actor, targetCard],
      );
      await db.exec(`
        insert into public.banned_emails(email,reason)
          values('blocked@cju.ac.kr','synthetic fixture');
        insert into public.magic_link_throttle(key_hash,scope,sent_in_window)
          values('fixture-hash','email',2);
      `);

      const snapshot = async () => ({
        auth: (await db.query("select * from auth.users order by id")).rows,
        users: (await db.query(`
          select id,email,gender,terms_accepted_at,privacy_accepted_at,banned,
                 banned_reason,created_at from public.users order by id
        `)).rows,
        cards: (await db.query(`
          select id,user_id,one_liner,instagram_id,color,hidden_by_user,
                 hidden_by_admin,created_at,updated_at from public.cards order by id
        `)).rows,
        matches: (await db.query("select * from public.matches order by id")).rows,
        participants: (await db.query(`
          select event_id,subject_key,current_user_id,allowance,used,
                 received_reveals,banned,created_at,updated_at
            from private.event_participants order by subject_key
        `)).rows,
        config: (await db.query(`
          select id,starts_at,ends_at,threshold_male,threshold_female,
                 force_locked,updated_at,event_id,purging,max_views_per_card,
                 board_mode,base_selection_allowance
            from public.session_config where id=1
        `)).rows,
        bans: (await db.query("select * from public.banned_emails order by email")).rows,
        throttle: (await db.query("select * from public.magic_link_throttle order by key_hash")).rows,
      });
      const before = await snapshot();
      expect(before.cards).toHaveLength(2);
      expect(before.matches).toHaveLength(1);

      for (const file of migrations.filter((name) => name >= "0024" && name < "0030")) {
        await apply(file);
      }

      expect(await snapshot()).toEqual(before);
      expect((await db.query(
        "select count(*)::int as count from public.users where retention_accepted_at is null",
      )).rows[0]).toEqual({ count: 2 });
      expect((await db.query<{ contact_type: string }>(
        "select contact_type from public.cards order by id",
      )).rows.map((row) => row.contact_type)).toEqual(["phone", "instagram"]);
      expect((await db.query(
        "select continuous_mode from public.session_config where id=1",
      )).rows[0]).toEqual({ continuous_mode: false });

      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({
          sub: actor,
          session_id: session,
          amr: [{ method: "otp" }],
        }),
      ]);
      await db.exec("set role authenticated");
      expect((await db.query(
        "select private.app_actor_active() as active",
      )).rows[0]).toEqual({ active: true });
    } finally {
      await db.close();
    }
  }, 30_000);
});
