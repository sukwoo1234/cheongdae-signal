import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase", "migrations", "0025_contact_method_types.sql"),
  "utf8",
);

describe("contact method migration", () => {
  it("backfills existing values and exposes contact_type through protected RPCs", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create schema private;
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

      create table public.users(
        id uuid primary key,
        email text not null,
        gender text,
        banned boolean not null default false
      );
      create table public.cards(
        id uuid primary key,
        user_id uuid not null references public.users(id),
        one_liner text not null,
        instagram_id text not null,
        color text not null,
        hidden_by_user boolean not null default false,
        hidden_by_admin boolean not null default false
      );
      create table public.matches(
        id uuid primary key,
        viewer_user_id uuid not null,
        viewed_card_id uuid not null references public.cards(id),
        bonus boolean not null default false,
        selection_number int not null default 1,
        created_at timestamptz not null default now(),
        unique(viewer_user_id, viewed_card_id)
      );
      create table public.session_config(
        id int primary key,
        event_id uuid not null,
        purging boolean not null default false,
        max_views_per_card int,
        board_mode text not null default 'opposite',
        base_selection_allowance int not null default 1,
        starts_at timestamptz not null default now(),
        ends_at timestamptz not null default now() + interval '1 day'
      );
      create table private.event_participants(
        event_id uuid not null,
        subject_key text not null,
        current_user_id uuid,
        allowance int not null default 1,
        used int not null default 0,
        received_reveals int not null default 0,
        banned boolean not null default false,
        primary key(event_id, subject_key)
      );
      create function private.app_actor_active() returns boolean language sql stable as $$ select true $$;
      create function private.gender_of(uuid) returns text language sql stable as $$ select 'F'::text $$;
      create function private.card_is_full(uuid) returns boolean language sql stable as $$ select false $$;
      create function public.board_is_open() returns boolean language sql stable as $$ select true $$;

      insert into public.users(id, email, gender) values
        ('10000000-0000-4000-8000-000000000001', 'one@cju.ac.kr', 'M'),
        ('10000000-0000-4000-8000-000000000002', 'two@cju.ac.kr', 'F');
      insert into public.cards(id, user_id, one_liner, instagram_id, color) values
        ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '전화 카드', '01012345678', 'blue'),
        ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '아이디 카드', 'cju_signal', 'pink');
      insert into public.session_config(id, event_id)
      values (1, '30000000-0000-4000-8000-000000000001');
    `);

    await db.exec(migration);

    const cards = await db.query<{ instagram_id: string; contact_type: string }>(`
      select instagram_id, contact_type from public.cards order by instagram_id
    `);
    expect(cards.rows).toEqual([
      { instagram_id: "01012345678", contact_type: "phone" },
      { instagram_id: "cju_signal", contact_type: "instagram" },
    ]);

    await expect(db.exec(`
      insert into public.cards(id, user_id, one_liner, instagram_id, contact_type, color)
      values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '오류', 'bad', 'email', 'blue')
    `)).rejects.toThrow();

    const results = await db.query<{ name: string; result: string }>(`
      select p.proname name, pg_get_function_result(p.oid) result
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('my_card', 'my_matches', 'consume_slot_and_reveal')
       order by p.proname
    `);
    expect(results.rows.every((row) => row.result.includes("contact_type"))).toBe(true);

    await db.close();
  }, 20_000);
});
