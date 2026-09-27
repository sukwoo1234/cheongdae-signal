import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase", "migrations", "0023_sync_existing_participant_allowance.sql"),
  "utf8"
);

describe("current event base allowance synchronization", () => {
  it("backfills existing participants and preserves administrator bonus slots", async () => {
    const db = new PGlite();
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema private;
      create table public.session_config (
        id integer primary key,
        event_id uuid not null,
        base_selection_allowance integer not null
      );
      create table private.event_participants (
        event_id uuid not null,
        subject_key text not null,
        allowance integer not null,
        used integer not null default 0 check (used <= allowance),
        primary key (event_id, subject_key)
      );
      insert into public.session_config values
        (1, '11111111-1111-1111-1111-111111111111', 2);
      insert into private.event_participants(event_id, subject_key, allowance) values
        ('11111111-1111-1111-1111-111111111111', 'existing', 1),
        ('11111111-1111-1111-1111-111111111111', 'bonus', 3);
    `);

    await db.exec(migration);
    expect(
      await db.query<{ subject_key: string; allowance: number }>(
        "select subject_key, allowance from private.event_participants order by subject_key"
      )
    ).toMatchObject({ rows: [
      { subject_key: "bonus", allowance: 3 },
      { subject_key: "existing", allowance: 2 },
    ] });

    await db.exec("update public.session_config set base_selection_allowance = 1 where id = 1");
    expect(
      await db.query<{ subject_key: string; allowance: number }>(
        "select subject_key, allowance from private.event_participants order by subject_key"
      )
    ).toMatchObject({ rows: [
      { subject_key: "bonus", allowance: 2 },
      { subject_key: "existing", allowance: 1 },
    ] });

    await db.exec("update public.session_config set base_selection_allowance = 2 where id = 1");
    expect(
      await db.query<{ subject_key: string; allowance: number }>(
        "select subject_key, allowance from private.event_participants order by subject_key"
      )
    ).toMatchObject({ rows: [
      { subject_key: "bonus", allowance: 3 },
      { subject_key: "existing", allowance: 2 },
    ] });

    await db.close();
  });
});
