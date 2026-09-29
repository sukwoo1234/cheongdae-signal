import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase", "migrations", "0024_persistent_participant_accounts.sql"),
  "utf8",
);

describe("persistent participant accounts", () => {
  it("purges event data, retains opted-in accounts, and lets them join the next event", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create schema private;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create table public.users(
        id uuid primary key references auth.users(id) on delete cascade,
        email text not null unique,
        gender text,
        terms_accepted_at timestamptz,
        privacy_accepted_at timestamptz,
        banned boolean not null default false,
        banned_reason text,
        created_at timestamptz not null default now()
      );
      create table public.cards(id uuid primary key, user_id uuid references public.users(id));
      create table public.matches(id uuid primary key, viewer_user_id uuid, viewed_card_id uuid);
      create table public.banned_emails(email text primary key);
      create table public.magic_link_throttle(key_hash text primary key);
      create table public.session_config(
        id int primary key,
        event_id uuid not null,
        purging boolean not null default false,
        force_locked boolean not null default false,
        max_views_per_card int,
        board_mode text not null default 'opposite',
        base_selection_allowance int not null default 1
      );
      create table private.event_participants(
        event_id uuid not null,
        subject_key text not null,
        current_user_id uuid,
        allowance int not null default 1,
        used int not null default 0,
        received_reveals int not null default 0,
        banned boolean not null default false,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        primary key(event_id, subject_key)
      );
      create function private.app_actor_active() returns boolean language sql as $$ select true $$;

      insert into public.session_config(id, event_id)
      values (1, '10000000-0000-4000-8000-000000000001');
      insert into auth.users(id, email, email_confirmed_at)
      values ('20000000-0000-4000-8000-000000000001', 'student@cju.ac.kr', now());
      insert into public.users(id, email, gender, banned, banned_reason)
      values ('20000000-0000-4000-8000-000000000001', 'student@cju.ac.kr', 'M', true, 'event');
      insert into public.cards(id, user_id)
      values ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001');
      insert into public.matches(id, viewer_user_id, viewed_card_id)
      values ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');
      insert into public.banned_emails(email) values ('student@cju.ac.kr');
      insert into public.magic_link_throttle(key_hash) values ('hash');
      insert into private.event_participants(event_id, subject_key, current_user_id)
      values ('10000000-0000-4000-8000-000000000001', repeat('a', 64), '20000000-0000-4000-8000-000000000001');
    `);

    await db.exec(migration);
    await db.exec(`
      update public.users set retention_accepted_at = now();
      update public.session_config set purging = true, force_locked = true where id = 1;
      select public.purge_current_event_data();
    `);

    const afterPurge = (await db.query<{
      users: number;
      cards: number;
      matches: number;
      participants: number;
    }>(`
      select
        (select count(*)::int from public.users) users,
        (select count(*)::int from public.cards) cards,
        (select count(*)::int from public.matches) matches,
        (select count(*)::int from private.event_participants) participants
    `)).rows[0];
    expect(afterPurge).toEqual({ users: 1, cards: 0, matches: 0, participants: 0 });

    const oldEvent = "10000000-0000-4000-8000-000000000001";
    const finish = await db.query<{ finish_event_purge: string }>("select public.finish_event_purge()");
    expect(finish.rows[0].finish_event_purge).not.toBe(oldEvent);

    const retained = (await db.query<{ banned: boolean; retention: boolean }>(`
      select banned, retention_accepted_at is not null retention
        from public.users
    `)).rows[0];
    expect(retained).toEqual({ banned: false, retention: true });

    const nextEvent = (await db.query<{ event_id: string }>(
      "select event_id from public.session_config where id = 1",
    )).rows[0].event_id;
    const rejoined = await db.query<{ remaining: number }>(`
      select remaining from public.rejoin_event_participant(
        '${nextEvent}',
        '20000000-0000-4000-8000-000000000001',
        'student@cju.ac.kr',
        repeat('b', 64),
        false
      )
    `);
    expect(rejoined.rows[0].remaining).toBe(1);

    await db.close();
  }, 20_000);
});
