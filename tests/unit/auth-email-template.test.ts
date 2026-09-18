import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe.each(["magic-link.html", "confirmation.html"])("%s", (file) => {
  const html = readFileSync(resolve(process.cwd(), "supabase", "templates", file), "utf8");

  it("routes the token hash through the app callback without a scanner-consumable confirmation URL", () => {
    expect(html).toContain("{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email");
    expect(html).not.toContain("{{ .ConfirmationURL }}");
  });

  it("identifies the service as independently operated", () => {
    expect(html).toContain("청주대학교 총학생회가 주관·주최하는 공식 사업이 아닌");
    expect(html).toContain("학생 개인 운영 서비스입니다.");
  });

  it("uses the exact supplied visual with a functional fallback link", () => {
    expect(html).toContain("https://cheongdae-signal.vercel.app/email-login-hero.png");
    expect(html).toContain("https://cheongdae-signal.vercel.app/email-login-lower-bg.png");
    expect(html).toContain("버튼이 열리지 않나요?");
  });

  it("keeps the compact card size, original outer background, and footer breathing room", () => {
    expect(html).toContain("max-width:680px");
    expect(html).toContain("hero-campus.webp");
    expect(html).toContain('class="lower-pad" style="padding:0 63px 82px;"');
  });

  it("keeps the supplied visual assets at their reference dimensions", () => {
    const hero = readFileSync(resolve(process.cwd(), "public", "email-login-hero.png"));
    const lower = readFileSync(resolve(process.cwd(), "public", "email-login-lower-bg.png"));

    expect(hero.readUInt32BE(16)).toBe(1212);
    expect(hero.readUInt32BE(20)).toBe(806);
    expect(lower.readUInt32BE(16)).toBe(1212);
    expect(lower.readUInt32BE(20)).toBe(492);
  });
});
