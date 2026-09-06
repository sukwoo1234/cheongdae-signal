import { describe, expect, it } from "vitest";
import { requireAjaxRequest } from "@/lib/csrf";

describe("mutation CSRF boundary", () => {
  it("rejects requests without the same-origin fetch marker", async () => {
    const response = requireAjaxRequest(new Request("https://example.com/api/matches", {
      method: "POST",
    }));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toEqual({ error: "CSRF_FAILED" });
  });

  it("accepts the marker used by the application's same-origin fetches", () => {
    const response = requireAjaxRequest(new Request("https://example.com/api/matches", {
      method: "POST",
      headers: { "X-Requested-With": "XMLHttpRequest" },
    }));

    expect(response).toBeNull();
  });
});
