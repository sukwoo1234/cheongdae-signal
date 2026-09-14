import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";

export type ContactKind = "id" | "phone";

const KOREAN_MOBILE_REGEX = /^01(?:0|1|[6-9])\d{7,8}$/;
const PHONE_INPUT_CHARS_REGEX = /^[\d\s.\-()]+$/u;
const KAKAO_ID_REGEX = /^[A-Za-z][A-Za-z0-9._-]{2,29}$/;

export function sanitizePhoneNumber(raw: string): string | null {
  const normalized = raw.normalize("NFKC").trim();
  if (!PHONE_INPUT_CHARS_REGEX.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, "");
  return KOREAN_MOBILE_REGEX.test(digits) ? digits : null;
}

export function sanitizeContactValue(raw: string): string {
  const phone = sanitizePhoneNumber(raw);
  return phone ?? sanitizeInstagramId(raw);
}

export function isValidContactValue(value: string): boolean {
  return KOREAN_MOBILE_REGEX.test(value) || isValidInstagramId(value) || KAKAO_ID_REGEX.test(value);
}

export function contactKind(value: string): ContactKind {
  return KOREAN_MOBILE_REGEX.test(value) ? "phone" : "id";
}

export function formatContactValue(value: string): string {
  if (contactKind(value) === "id") return value;
  if (value.length === 10) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}
