import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ active: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getActiveUser: mocks.active,
  denialResponse: (error: string) => Response.json({error},{status:401}) }));
import { GET, POST } from "@/app/api/season/route";
const body = {accepted:true,event_id:"30000000-0000-4000-8000-000000000001",
  ends_at:"2027-01-30T14:59:00Z",board_mode:"selectable"};
const request = (data: unknown, ajax = true) => new Request("https://example.test/api/season", {
  method:"POST",headers:ajax ? {"X-Requested-With":"XMLHttpRequest"} : {},body:JSON.stringify(data),
});
beforeEach(() => {
  vi.resetAllMocks();
  mocks.active.mockResolvedValue({supabase:{rpc:mocks.rpc},user:{id:"participant"},denial:null});
});
describe("season consent API", () => {
  it("returns the participant-specific state without caching", async () => {
    mocks.rpc.mockResolvedValue({data:[{...body,accepted:false}],error:null});
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect((await res.json()).season.accepted).toBe(false);
  });
  it("requires an explicit acceptance action and ajax header", async () => {
    expect((await POST(request({...body,accepted:false}))).status).toBe(400);
    expect((await POST(request(body,false))).status).toBe(403);
    expect((await POST(request(null))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes the displayed period and audience to the user-scoped database function", async () => {
    mocks.rpc.mockResolvedValue({error:null});
    expect((await POST(request(body))).status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("accept_current_season",{
      p_event_id:body.event_id,p_ends_at:body.ends_at,p_board_mode:"selectable",
    });
  });
  it("does not treat a stale or failed database write as consent", async () => {
    mocks.rpc.mockResolvedValue({error:{message:"SEASON_CHANGED"}});
    expect((await POST(request(body))).status).toBe(409);
  });
  it("requires an active participant for reading and changing consent", async () => {
    mocks.active.mockResolvedValue({user:null,denial:"UNAUTHENTICATED"});
    expect((await GET()).status).toBe(401);
    expect((await POST(request(body))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
