import React, { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn(), fetch: vi.fn() }));
const router = { replace: mocks.replace, push: mocks.push };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ children, href }: { children: ReactNode; href: string }) =>
  React.createElement("a", { href }, children) }));
vi.mock("@/components/CampusShell", () => ({ CampusShell: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/SignalLoading", () => ({ SignalLoading: ({ message }: { message: string }) => message }));
vi.mock("@/components/PetalCard", () => ({ PetalCard: () => null }));
vi.mock("@/components/GraduationCapBadge", () => ({ GraduationCapBadge: () => null }));
vi.mock("@/components/ColorPicker", () => ({ ColorPicker: () => null }));
import { SeasonBoundary } from "@/components/SeasonBoundary";
import NewCard from "@/app/card/new/page";

const legacy = { event_id: "30000000-0000-4000-8000-000000000001", continuous_mode: true,
  ends_at: "2027-01-30T14:59:00Z", participation_ends_at: "2026-10-11T14:59:00Z",
  accepted: false, board_mode: "selectable", base_allowance: 2 };
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-08T01:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.fetch.mockImplementation(async () => Response.json({ season: legacy }));
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const posts = () => mocks.fetch.mock.calls.filter(([, options]) => options?.method === "POST");

describe("separate existing-participant notice and new card form", () => {
  it("shows one enabled consent button and no checkbox to an existing participant", async () => {
    await act(async () => root.render(<SeasonBoundary>보드 내용</SeasonBoundary>));
    expect(container.textContent).toContain("운영 방식이 달라졌어요");
    expect(container.textContent).toContain("2027년 1월 30일");
    expect(container.textContent).toContain("남성·여성 모두에게");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    const button = container.querySelector("button")!;
    expect(button.textContent).toBe("동의하고 계속 참여");
    expect(button.disabled).toBe(false);
    expect(posts()).toHaveLength(0);
    mocks.fetch.mockImplementation(async (_url, options) => options?.method === "POST"
      ? Response.json({ ok: true }) : Response.json({ season: { ...legacy, accepted: true } }));
    await act(async () => button.click());
    expect(posts()).toHaveLength(1);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ accepted: true, event_id: legacy.event_id,
      ends_at: legacy.ends_at, board_mode: "selectable" });
    expect(container.textContent).toBe("보드 내용");
  });
  it("does not show the legacy notice to new participants who visit the board", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ season: { ...legacy, participation_ends_at: legacy.ends_at } }));
    await act(async () => root.render(<SeasonBoundary>보드 내용</SeasonBoundary>));
    expect(container.textContent).not.toContain("운영 방식이 달라졌어요");
    expect(mocks.replace).toHaveBeenCalledWith("/card/new");
    expect(posts()).toHaveLength(0);
  });
  it("does not repeat the notice after the participant has accepted", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ season: { ...legacy, accepted: true } }));
    await act(async () => root.render(<SeasonBoundary>보드 내용</SeasonBoundary>));
    expect(container.textContent).toBe("보드 내용");
    expect(posts()).toHaveLength(0);
  });
  it("shows inline disclosure with the new card form, without another page or checkbox", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ season: { ...legacy, participation_ends_at: legacy.ends_at } }));
    await act(async () => root.render(<NewCard />));
    expect(container.textContent).toContain("카드 만들기");
    expect(container.textContent).toContain("아래 버튼을 누르면 이 안내에 동의하고 카드를 등록합니다.");
    expect(container.textContent).toContain("동의하고 보드에 올리기");
    expect(container.textContent).not.toContain("운영 방식이 달라졌어요");
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(posts()).toHaveLength(0);
  });
  it("keeps submission disabled if the registration disclosure cannot be loaded", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ error: "SEASON_UNAVAILABLE" }, { status: 503 }));
    await act(async () => root.render(<NewCard />));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("운영 안내를 불러오지 못했어요");
    const submit = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("보드에 올리기"));
    expect(submit?.disabled).toBe(true);
    expect(posts()).toHaveLength(0);
  });
  it("submits inline consent only with the new card button, without a separate consent request", async () => {
    mocks.fetch.mockImplementation(async () => Response.json({ season: { ...legacy, participation_ends_at: legacy.ends_at } }));
    await act(async () => root.render(<NewCard />));
    const inputs = container.querySelectorAll("input");
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(inputs[0], "친구 구해요");
      inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
      setValue.call(inputs[1], "student_id");
      inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(posts()).toHaveLength(0);
    const submit = [...container.querySelectorAll("button")].find(button => button.textContent?.includes("동의하고 보드에 올리기"))!;
    expect(submit.disabled).toBe(false);
    mocks.fetch.mockImplementation(async () => Response.json({ ok: true, id: "new-card" }));
    await act(async () => submit.click());
    expect(posts()).toHaveLength(1);
    expect(posts()[0][0]).toBe("/api/cards");
    expect(JSON.parse(posts()[0][1].body)).toMatchObject({ one_liner: "친구 구해요", instagram_id: "student_id",
      season_consent: { accepted: true, event_id: legacy.event_id, ends_at: legacy.ends_at, board_mode: "selectable" } });
    expect(mocks.push).toHaveBeenCalledWith("/board");
  });
});
