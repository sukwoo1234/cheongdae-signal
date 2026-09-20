import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getAdminContext: mocks.context,
  isConfiguredAdminEmail: (email: string) => email === "admin@cju.ac.kr",
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));

import { GET, POST, DELETE } from "@/app/api/admin/permanent-bans/route";
import { POST as hideCard } from "@/app/api/admin/cards/[id]/hide/route";

const headers = { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" };
function req(method: string, body: object) {
  return new Request("https://audit.invalid/api/admin/permanent-bans", {
    method, headers, body: JSON.stringify(body),
  });
}

describe("admin permanent bans and card visibility", () => {
  let client: ReturnType<typeof makeClient>;

  function makeClient() {
    const query = {
      select: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { id: "card-id" }, error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.gt.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.update.mockReturnValue(query);
    query.limit.mockResolvedValue({ data: [], error: null });
    return {
      from: vi.fn().mockReturnValue(query),
      rpc: vi.fn().mockResolvedValue({ data: "student-id", error: null }),
      auth: { admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
      query,
    };
  }

  beforeEach(() => {
    vi.resetAllMocks();
    client = makeClient();
    mocks.admin.mockReturnValue(client);
    mocks.context.mockResolvedValue({ user: { id: "admin-id" } });
  });

  it("requires administrator MFA for reading bans", async () => {
    mocks.context.mockResolvedValue({ user: null });
    expect((await GET()).status).toBe(403);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("validates school email and a reason", async () => {
    expect((await POST(req("POST", { email: "outside@example.com", reason: "abuse" }))).status).toBe(400);
    expect((await POST(req("POST", { email: "student@cju.ac.kr", reason: " " }))).status).toBe(400);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("blocks in the database before deleting the account", async () => {
    const response = await POST(req("POST", { email: " STUDENT@CJU.AC.KR ", reason: "false contact" }));
    expect(response.status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("add_permanent_ban", {
      p_email: "student@cju.ac.kr", p_reason: "false contact", p_actor: "admin-id",
    });
    expect(client.auth.admin.deleteUser).toHaveBeenCalledWith("student-id");
    expect(client.rpc.mock.invocationCallOrder[0]).toBeLessThan(client.auth.admin.deleteUser.mock.invocationCallOrder[0]);
  });

  it("reports account deletion failure without falsely claiming success", async () => {
    client.auth.admin.deleteUser.mockResolvedValue({ error: { message: "failed" } });
    expect((await POST(req("POST", { email: "student@cju.ac.kr", reason: "abuse" }))).status).toBe(502);
  });

  it("releases only the permanent ban", async () => {
    client.rpc.mockResolvedValue({ data: true, error: null });
    expect((await DELETE(req("DELETE", { email: "student@cju.ac.kr" }))).status).toBe(200);
    expect(client.rpc).toHaveBeenCalledWith("release_permanent_ban", { p_email: "student@cju.ac.kr" });
    expect(client.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("sets both hidden and visible states on the card", async () => {
    const ctx = { params: Promise.resolve({ id: "card-id" }) };
    expect((await hideCard(req("POST", { hidden: true }), ctx)).status).toBe(200);
    expect((await hideCard(req("POST", { hidden: false }), ctx)).status).toBe(200);
    expect(client.query.update).toHaveBeenNthCalledWith(1, { hidden_by_admin: true });
    expect(client.query.update).toHaveBeenNthCalledWith(2, { hidden_by_admin: false });
  });
});
