import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getAdminContext: mocks.context }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { POST } from "@/app/api/admin/wipe-data/route";

describe("persistent account event purge", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("deletes event data and expired accounts while retaining opted-in recent accounts", async () => {
    const before = {
      matches: 3,
      cards: 4,
      users: 3,
      banned_emails: 1,
      throttles: 2,
      participants: 4,
    };
    const after = {
      matches: 0,
      cards: 0,
      users: 1,
      banned_emails: 0,
      throttles: 0,
      participants: 0,
    };
    const rpc = vi.fn((name: string) => {
      if (name === "event_purge_status") {
        const calls = rpc.mock.calls.filter(([called]) => called === "event_purge_status").length;
        return Promise.resolve({ data: [calls === 1 ? before : after], error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({
      rpc,
      from: vi.fn(() => ({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: "recent", last_active_at: "2099-01-01T00:00:00Z", retention_accepted_at: "2026-01-01T00:00:00Z" },
            { id: "expired", last_active_at: "2020-01-01T00:00:00Z", retention_accepted_at: "2020-01-01T00:00:00Z" },
            { id: "no-consent", last_active_at: "2099-01-01T00:00:00Z", retention_accepted_at: null },
          ],
          error: null,
        }),
      })),
      auth: { admin: { deleteUser } },
    });

    const response = await POST(new Request("https://stage.invalid/api/admin/wipe-data", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
      body: JSON.stringify({ confirm: "WIPE" }),
    }));

    expect(response.status).toBe(200);
    expect(deleteUser).toHaveBeenCalledTimes(2);
    expect(deleteUser).toHaveBeenCalledWith("expired");
    expect(deleteUser).toHaveBeenCalledWith("no-consent");
    expect(deleteUser).not.toHaveBeenCalledWith("recent");
    expect(rpc).toHaveBeenCalledWith("finish_event_purge");
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.remaining.users).toBe(1);
  });
});
