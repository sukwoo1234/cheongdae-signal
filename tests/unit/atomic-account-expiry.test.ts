import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { accountRetentionCutoff } from "@/lib/account-retention";

const A = "10000000-0000-4000-8000-000000000001";
const B = "10000000-0000-4000-8000-000000000002";
const C = "10000000-0000-4000-8000-000000000003";
const D = "10000000-0000-4000-8000-000000000004";
const E = "10000000-0000-4000-8000-000000000005";
const users = [A, B, C, D, E];
const sessions = users.map((_, index) => `30000000-0000-4000-8000-00000000000${index + 1}`);
const cutoff = accountRetentionCutoff().toISOString();

async function createDatabase() {
  const db = new PGlite();
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
      $$select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as
      $$select nullif(current_setting('request.jwt.claims',true),'')::jsonb$$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    create schema cron;
    create function cron.schedule(text,text,text) returns bigint language sql as $$select 1::bigint$$;
  `);
  const migrationDir = resolve(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(migrationDir).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(migrationDir, file), "utf8")
      .replace(/create extension if not exists (pgcrypto|pg_cron);/g, "");
    await db.exec(sql);
  }
  await db.exec(`
    update public.session_config
       set starts_at = now() - interval '1 hour',
           ends_at = now() + interval '1 day',
           force_locked = false
     where id = 1;
  `);
  for (let i = 0; i < users.length; i++) {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [users[i], `fixture${i + 1}@cju.ac.kr`],
    );
    await db.query(
      "insert into auth.sessions(id,user_id,not_after) values($1,$2,now()+interval '1 day')",
      [sessions[i], users[i]],
    );
    await db.query(
      `insert into public.users(id,email,last_active_at,retention_accepted_at)
       values($1,$2,$3,now())`,
      [users[i], `fixture${i + 1}@cju.ac.kr`, i === 3 ? "2099-01-01T00:00:00Z" : "2020-01-01T00:00:00Z"],
    );
  }
  return db;
}

async function expire(db: PGlite, id: string) {
  await db.exec("set role service_role");
  try {
    const result = await db.query<{ deleted: boolean }>(
      "select public.expire_retained_account_if_eligible($1,$2) as deleted",
      [id, cutoff],
    );
    return result.rows[0].deleted;
  } finally {
    await db.exec("reset role");
  }
}

async function actorActive(db: PGlite, id: string, sessionId: string) {
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({
      sub: id, session_id: sessionId, email: "fixture2@cju.ac.kr",
      amr: [{ method: "otp", timestamp: 1 }], role: "authenticated",
    }),
  ]);
  await db.exec("set role authenticated");
  try {
    return (await db.query<{ active: boolean }>(
      "select private.app_actor_active() as active",
    )).rows[0].active;
  } finally {
    await db.exec("reset role");
  }
}

describe("atomic retained-account expiry", () => {
  it("serializes rejoin, preserves an active event, and deletes Auth sessions with an expired account", async () => {
    const db = await createDatabase();
    try {
      const privilege = (await db.query<{
        anon: boolean; authenticated: boolean; service: boolean;
      }>(`
        select
          has_function_privilege('anon',
            'public.expire_retained_account_if_eligible(uuid,timestamptz)', 'execute') as anon,
          has_function_privilege('authenticated',
            'public.expire_retained_account_if_eligible(uuid,timestamptz)', 'execute') as authenticated,
          has_function_privilege('service_role',
            'public.expire_retained_account_if_eligible(uuid,timestamptz)', 'execute') as service
      `)).rows[0];
      expect(privilege).toEqual({ anon: false, authenticated: false, service: true });

      const eventId = (await db.query<{ event_id: string }>(
        "select event_id from public.session_config where id=1",
      )).rows[0].event_id;
      for (const [index, id] of [[1, B], [4, E]] as const) {
        await db.query(
          "select * from public.register_event_participant($1,$2,$3,$4)",
          [eventId, id, `fixture${index + 1}@cju.ac.kr`, String.fromCharCode(97 + index).repeat(64)],
        );
        await db.query(
          "update public.users set last_active_at='2020-01-01T00:00:00Z' where id=$1",
          [id],
        );
      }
      await db.query(
        `insert into public.cards(user_id,one_liner,instagram_id,color)
         values($1,'active card','fixture_b','yellow')`,
        [B],
      );
      await db.query(
        "update private.event_participants set banned=true where event_id=$1 and current_user_id=$2",
        [eventId, E],
      );

      expect(await actorActive(db, B, sessions[1])).toBe(true);
      expect(await expire(db, B)).toBe(false);
      expect(await expire(db, E)).toBe(false);
      expect((await db.query<{ count: number }>(
        "select count(*)::int as count from public.cards where user_id=$1", [B],
      )).rows[0].count).toBe(1);

      // An API request may have observed an old last_active_at before another
      // request rejoined. The RPC must use the locked, current database state.
      const staleRead = (await db.query<{ last_active_at: string }>(
        "select last_active_at from public.users where id=$1", [C],
      )).rows[0].last_active_at;
      expect(new Date(staleRead).getTime()).toBeLessThan(new Date(cutoff).getTime());
      await db.query(
        "select * from public.rejoin_event_participant($1,$2,$3,$4,false)",
        [eventId, C, "fixture3@cju.ac.kr", "c".repeat(64)],
      );
      expect(await expire(db, C)).toBe(false);
      expect((await db.query<{ count: number }>(
        "select count(*)::int as count from auth.users where id=$1", [C],
      )).rows[0].count).toBe(1);
      expect((await db.query<{ count: number }>(
        "select count(*)::int as count from private.event_participants where event_id=$1 and current_user_id=$2",
        [eventId, C],
      )).rows[0].count).toBe(1);

      const expiryDefinition = (await db.query<{ definition: string }>(
        "select pg_get_functiondef('public.expire_retained_account_if_eligible(uuid,timestamptz)'::regprocedure) as definition",
      )).rows[0].definition.toLowerCase();
      const rejoinDefinition = (await db.query<{ definition: string }>(
        "select pg_get_functiondef('public.rejoin_event_participant(uuid,uuid,text,text,boolean)'::regprocedure) as definition",
      )).rows[0].definition.toLowerCase();
      for (const definition of [expiryDefinition, rejoinDefinition]) {
        expect(definition.indexOf("for share")).toBeGreaterThan(-1);
        expect(definition.indexOf("for update")).toBeGreaterThan(definition.indexOf("for share"));
      }

      expect(await expire(db, D)).toBe(false);
      expect(await expire(db, A)).toBe(true);
      const removed = (await db.query<{ auth: number; profile: number; session: number }>(
        `select
          (select count(*)::int from auth.users where id=$1) as auth,
          (select count(*)::int from public.users where id=$1) as profile,
          (select count(*)::int from auth.sessions where user_id=$1) as session`,
        [A],
      )).rows[0];
      expect(removed).toEqual({ auth: 0, profile: 0, session: 0 });

      await db.exec("update public.session_config set ends_at=now()-interval '1 second' where id=1");
      expect(await expire(db, B)).toBe(true);
      expect(await actorActive(db, B, sessions[1])).toBe(false);
      const ended = (await db.query<{
        auth: number; card: number; session: number; linked: number; ledger: number;
      }>(`select
        (select count(*)::int from auth.users where id=$1) as auth,
        (select count(*)::int from public.cards where user_id=$1) as card,
        (select count(*)::int from auth.sessions where user_id=$1) as session,
        (select count(*)::int from private.event_participants where current_user_id=$1) as linked,
        (select count(*)::int from private.event_participants where event_id=$2) as ledger`,
        [B, eventId],
      )).rows[0];
      expect(ended).toEqual({ auth: 0, card: 0, session: 0, linked: 0, ledger: 3 });

      await db.exec("update public.session_config set purging=true where id=1");
      await expect(expire(db, E)).rejects.toThrow("PURGE_IN_PROGRESS");
      expect((await db.query<{ count: number }>(
        "select count(*)::int as count from auth.users where id=$1", [E],
      )).rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
