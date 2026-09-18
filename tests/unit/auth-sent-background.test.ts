import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("magic-link sent page design", () => {
  it("uses the cloud background and reference card styling", () => {
    const page = readFileSync(resolve(process.cwd(), "app", "auth", "sent", "page.tsx"), "utf8");

    expect(page).toContain("linear-gradient(180deg,#cfe8ff_0%,#e8efff_45%,#ffe1ee_100%)");
    expect(page).not.toContain("hero-campus.webp");
    expect(page).toContain("max-w-[640px]");
    expect(page).toContain("CHEONGJU");
    expect(page).toContain("메일함을<br />");
    expect(page).toContain("bg-[linear-gradient(100deg,#78b8f6_0%,#b7a3ee_52%,#ef83bd_100%)]");
    expect(page).toContain("이메일 주소 복사");
    expect(page).toContain("해주세요.");
    expect(page).not.toContain('해주세요<span className="text-[#ec78ad]">.</span>');
    expect(page).toContain(">15분</span>");
    expect(page).not.toContain("15<br />분");
  });
});
