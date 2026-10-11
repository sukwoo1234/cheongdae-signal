import { describe, expect, it, vi } from "vitest";
import { expireRetainedAccount } from "@/lib/expire-account";
import type { createAdminClient } from "@/lib/supabase/admin";

describe("retained account expiry RPC", () => {
  it("retries one fully rolled-back deadlock with the same retention cutoff", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: null, error: { code: "40P01" } })
      .mockResolvedValueOnce({ data: false, error: null });
    const admin = { rpc } as unknown as ReturnType<typeof createAdminClient>;

    expect((await expireRetainedAccount(admin, "user-id")).data).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
  });

  it("does not retry unrelated database failures", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "42501" } });
    const admin = { rpc } as unknown as ReturnType<typeof createAdminClient>;

    expect((await expireRetainedAccount(admin, "user-id")).error?.code).toBe("42501");
    expect(rpc).toHaveBeenCalledOnce();
  });
});
