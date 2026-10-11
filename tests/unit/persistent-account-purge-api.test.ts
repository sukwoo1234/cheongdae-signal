import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAdminContext: mocks.context,
  isAdminUser: (user: { id: string }) => user.id === "admin-id",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { POST } from "../../app/api/admin/wipe-data/route";

type Profile = {
  id: string;
  last_active_at: string;
  retention_accepted_at: string | null;
};
type AuthUser = { id: string; email: string };

const recent = "2099-01-01T00:00:00Z";
const old = "2020-01-01T00:00:00Z";
const consented = "2026-01-01T00:00:00Z";
const eventId = "10000000-0000-4000-8000-000000000001";
const nextEventId = "10000000-0000-4000-8000-000000000002";

function fixture(initialProfiles: Profile[], extraAuthUsers: AuthUser[] = []) {
  const profiles = [...initialProfiles];
  const authUsers: AuthUser[] = [
    { id: "admin-id", email: "admin@cju.ac.kr" },
    ...initialProfiles.filter((profile) => profile.id !== "admin-id")
      .map((profile) => ({ id: profile.id, email: `${profile.id}@cju.ac.kr` })),
    ...extraAuthUsers,
  ];
  let eventDataPresent = true;
  let currentEventId = eventId;
  let purging = false;
  let leaseToken: string | null = null;
  const failedDeletes = new Set<string>();

  const rpc = vi.fn(async (name: string, args?: { p_expected_event_id?: string; p_token?: string }) => {
    if (name === "event_purge_status") {
      return {
        data: [{
          matches: eventDataPresent ? 3 : 0,
          cards: eventDataPresent ? 4 : 0,
          users: profiles.length,
          banned_emails: eventDataPresent ? 1 : 0,
          throttles: eventDataPresent ? 2 : 0,
          participants: eventDataPresent ? 4 : 0,
        }],
        error: null,
      };
    }
    if (name === "begin_event_purge") {
      if (args?.p_expected_event_id !== currentEventId) {
        return { data: null, error: { message: "STALE_EVENT" } };
      }
      if (leaseToken && leaseToken !== args?.p_token) {
        return { data: null, error: { message: "PURGE_BUSY" } };
      }
      leaseToken = args?.p_token ?? null;
      purging = true;
    }
    if (name === "purge_current_event_data") {
      if (args?.p_expected_event_id !== currentEventId || args?.p_token !== leaseToken) {
        return { data: null, error: { message: "STALE_EVENT" } };
      }
      eventDataPresent = false;
    }
    if (name === "finish_event_purge") {
      if (args?.p_expected_event_id !== currentEventId || args?.p_token !== leaseToken) {
        return { data: null, error: { message: "STALE_EVENT" } };
      }
      currentEventId = nextEventId;
      purging = false;
      leaseToken = null;
    }
    if (name === "release_event_purge_lease" && leaseToken === args?.p_token) {
      leaseToken = null;
    }
    return { data: null, error: null };
  });

  const deleteUser = vi.fn(async (id: string) => {
    if (failedDeletes.has(id)) return { error: { message: "simulated failure" } };
    const authIndex = authUsers.findIndex((entry) => entry.id === id);
    if (authIndex >= 0) authUsers.splice(authIndex, 1);
    const profileIndex = profiles.findIndex((entry) => entry.id === id);
    if (profileIndex >= 0) profiles.splice(profileIndex, 1);
    return { error: null };
  });

  const listUsers = vi.fn(async ({ page, perPage }: { page: number; perPage: number }) => ({
    data: { users: authUsers.slice((page - 1) * perPage, page * perPage) },
    error: null,
  }));

  const from = vi.fn((table: string) => {
    if (table !== "users") throw new Error(`Unexpected table: ${table}`);
    return {
      select: vi.fn((_columns: string, options?: { count?: string; head?: boolean }) => {
        let excludedId: string | null = null;
        const query = {
          neq: (_column: string, id: string) => {
            excludedId = id;
            return query;
          },
          is: (_column: string, value: null) => {
            expect(value).toBeNull();
            const rows = profiles.filter((profile) =>
              profile.id !== excludedId && profile.retention_accepted_at === null);
            if (options?.head) return Promise.resolve({ count: rows.length, error: null });
            return { limit: async (n: number) => ({ data: rows.slice(0, Math.min(n, 1000)), error: null }) };
          },
          lt: (_column: string, cutoff: string) => {
            const rows = profiles.filter((profile) =>
              profile.id !== excludedId && profile.last_active_at < cutoff);
            if (options?.head) return Promise.resolve({ count: rows.length, error: null });
            return { limit: async (n: number) => ({ data: rows.slice(0, Math.min(n, 1000)), error: null }) };
          },
          in: async (_column: string, ids: string[]) => ({
            data: profiles.filter((profile) => ids.includes(profile.id)).map(({ id }) => ({ id })),
            error: null,
          }),
        };
        return query;
      }),
    };
  });

  const admin = { rpc, from, auth: { admin: { deleteUser, listUsers } } };
  mocks.admin.mockReturnValue(admin);
  return { admin, profiles, authUsers, rpc, deleteUser, listUsers, failedDeletes,
    getEventId: () => currentEventId, isPurging: () => purging };
}

function request(requestedEventId = eventId) {
  return POST(new Request("https://stage.invalid/api/admin/wipe-data", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
    body: JSON.stringify({ confirm: "WIPE", event_id: requestedEventId }),
  }));
}

describe("persistent account event purge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("deletes expired and unconsented accounts while retaining recent consented accounts", async () => {
    const f = fixture([
      { id: "recent", last_active_at: recent, retention_accepted_at: consented },
      { id: "expired", last_active_at: old, retention_accepted_at: consented },
      { id: "no-consent", last_active_at: recent, retention_accepted_at: null },
    ]);

    const response = await request();

    expect(response.status).toBe(200);
    expect(f.deleteUser).toHaveBeenCalledTimes(2);
    expect(f.deleteUser).toHaveBeenCalledWith("expired");
    expect(f.deleteUser).toHaveBeenCalledWith("no-consent");
    expect(f.deleteUser).not.toHaveBeenCalledWith("recent");
    expect(f.deleteUser).not.toHaveBeenCalledWith("admin-id");
    expect(f.rpc).toHaveBeenCalledWith("finish_event_purge", {
      p_expected_event_id: eventId, p_token: expect.any(String),
    });
    expect((await response.json()).remaining.users).toBe(1);
  });

  it("preserves an unconsented or expired administrator profile", async () => {
    const f = fixture([
      { id: "admin-id", last_active_at: old, retention_accepted_at: null },
      { id: "recent", last_active_at: recent, retention_accepted_at: consented },
    ]);

    const response = await request();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(f.deleteUser).not.toHaveBeenCalledWith("admin-id");
    expect(f.profiles).toHaveLength(2);
    expect(body.remaining.users).toBe(2);
    expect(body.remaining.pendingProfileCount).toBe(0);
    expect(body.remaining).not.toHaveProperty("authUsers");
  });

  it("rejects a retry after a completed wipe without touching the next event", async () => {
    const f = fixture([{ id: "recent", last_active_at: recent, retention_accepted_at: consented }]);
    expect((await request()).status).toBe(200);
    expect(f.getEventId()).toBe(nextEventId);
    const purgeCalls = f.rpc.mock.calls.filter(([name]) => name === "purge_current_event_data").length;

    const retry = await request();
    expect(retry.status).toBe(409);
    expect(await retry.json()).toEqual({ error: "EVENT_CHANGED" });
    expect(f.rpc.mock.calls.filter(([name]) => name === "purge_current_event_data")).toHaveLength(purgeCalls);
    expect(f.getEventId()).toBe(nextEventId);
    expect(f.isPurging()).toBe(false);
  });

  it("rejects a concurrent wipe while another worker holds the event lease", async () => {
    const f = fixture([{ id: "recent", last_active_at: recent, retention_accepted_at: consented }]);
    const otherToken = "90000000-0000-4000-8000-000000000009";
    await f.rpc("begin_event_purge", { p_expected_event_id: eventId, p_token: otherToken });

    const concurrent = await request();
    expect(concurrent.status).toBe(409);
    expect(await concurrent.json()).toEqual({ error: "PURGE_IN_PROGRESS" });
    expect(f.rpc).not.toHaveBeenCalledWith("purge_current_event_data", expect.anything());

    await f.rpc("release_event_purge_lease", { p_expected_event_id: eventId, p_token: otherToken });
    expect((await request()).status).toBe(200);
  });

  it("finds a deletion target beyond the configured 1000-row API cap", async () => {
    const retained = Array.from({ length: 1000 }, (_, index) => ({
      id: `retained-${index}`, last_active_at: recent, retention_accepted_at: consented,
    }));
    const f = fixture([
      ...retained,
      { id: "last-unconsented", last_active_at: recent, retention_accepted_at: null },
    ]);

    const response = await request();

    expect(response.status).toBe(200);
    expect(f.deleteUser).toHaveBeenCalledExactlyOnceWith("last-unconsented");
    expect(f.listUsers.mock.calls.length).toBeGreaterThan(5);
    expect(f.profiles).toHaveLength(1000);
    expect(f.rpc).toHaveBeenCalledWith("finish_event_purge", {
      p_expected_event_id: eventId, p_token: expect.any(String),
    });
  });

  it("keeps purging until more than one deletion batch has finished", async () => {
    const f = fixture([
      ...Array.from({ length: 101 }, (_, index) => ({
        id: `unconsented-${index}`, last_active_at: recent, retention_accepted_at: null,
      })),
      { id: "recent", last_active_at: recent, retention_accepted_at: consented },
    ]);

    const first = await request();
    expect(first.status).toBe(202);
    expect((await first.json()).ok).toBe(false);
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_event_purge")).toHaveLength(0);
    expect(f.profiles).toHaveLength(2);

    const second = await request();
    expect(second.status).toBe(200);
    expect(f.profiles).toEqual([{ id: "recent", last_active_at: recent, retention_accepted_at: consented }]);
    expect(f.rpc).toHaveBeenCalledWith("finish_event_purge", {
      p_expected_event_id: eventId, p_token: expect.any(String),
    });
  });

  it("deletes Auth accounts with no profile and protects the administrator", async () => {
    const f = fixture(
      [{ id: "recent", last_active_at: recent, retention_accepted_at: consented }],
      [{ id: "unused-link", email: "unused@cju.ac.kr" }],
    );

    const first = await request();
    expect(first.status).toBe(202);
    expect(f.deleteUser).toHaveBeenCalledExactlyOnceWith("unused-link");
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_event_purge")).toHaveLength(0);

    const second = await request();
    expect(second.status).toBe(200);
    expect(f.deleteUser).not.toHaveBeenCalledWith("admin-id");
    expect(f.rpc).toHaveBeenCalledWith("finish_event_purge", {
      p_expected_event_id: eventId, p_token: expect.any(String),
    });
  });

  it("finds an orphan Auth account after more than 1000 retained accounts", async () => {
    const retained = Array.from({ length: 1001 }, (_, index) => ({
      id: `retained-${index}`, last_active_at: recent, retention_accepted_at: consented,
    }));
    const f = fixture(retained, [{ id: "late-orphan", email: "late@cju.ac.kr" }]);

    const first = await request();
    expect(first.status).toBe(202);
    expect(f.deleteUser).toHaveBeenCalledExactlyOnceWith("late-orphan");
    expect(f.listUsers.mock.calls.length).toBeGreaterThan(5);
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_event_purge")).toHaveLength(0);

    const second = await request();
    expect(second.status).toBe(200);
    expect(f.profiles).toHaveLength(1001);
    expect(f.rpc).toHaveBeenCalledWith("finish_event_purge", {
      p_expected_event_id: eventId, p_token: expect.any(String),
    });
  });

  it("does not finish when an Auth deletion fails", async () => {
    const f = fixture([{ id: "unconsented", last_active_at: recent, retention_accepted_at: null }]);
    f.failedDeletes.add("unconsented");

    const response = await request();

    expect(response.status).toBe(500);
    expect((await response.json()).ok).toBe(false);
    expect(f.rpc.mock.calls.filter(([name]) => name === "finish_event_purge")).toHaveLength(0);
  });
});
