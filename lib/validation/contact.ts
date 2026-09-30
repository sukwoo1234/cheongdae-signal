import { sanitizeInstagramId, isValidInstagramId } from "@/lib/validation/instagram";

export type ContactType = "instagram" | "kakao" | "phone";

export const CONTACT_TYPES: ContactType[] = ["instagram", "kakao", "phone"];

const KOREAN_MOBILE_REGEX = /^01(?:0|1|[6-9])\d{7,8}$/;
const PHONE_INPUT_CHARS_REGEX = /^[\d\s.\-()]+$/u;
const KAKAO_ID_REGEX = /^[A-Za-z][A-Za-z0-9._-]{2,29}$/;

export function sanitizePhoneNumber(raw: string): string | null {
  const normalized = raw.normalize("NFKC").trim();
  if (!PHONE_INPUT_CHARS_REGEX.test(normalized)) return null;
  const digits = normalized.replace(/\D/g, "");
  return KOREAN_MOBILE_REGEX.test(digits) ? digits : null;
}

export function isContactType(value: unknown): value is ContactType {
  return typeof value === "string" && CONTACT_TYPES.includes(value as ContactType);
}

export function sanitizeContactValue(raw: string, type: ContactType): string {
  if (type === "phone") return sanitizePhoneNumber(raw) ?? raw.normalize("NFKC").trim();
  return sanitizeInstagramId(raw);
}

export function isValidContactValue(value: string, type: ContactType): boolean {
  if (type === "phone") return KOREAN_MOBILE_REGEX.test(value);
  if (KOREAN_MOBILE_REGEX.test(value)) return false;
  if (type === "kakao") return KAKAO_ID_REGEX.test(value);
  return isValidInstagramId(value);
}

export function contactTypeLabel(type: ContactType): string {
  if (type === "instagram") return "인스타그램 ID";
  if (type === "kakao") return "카카오톡 ID";
  return "휴대전화 번호";
}

export function contactTypeShortLabel(type: ContactType): string {
  if (type === "instagram") return "인스타그램";
  if (type === "kakao") return "카카오톡";
  return "휴대전화";
}

export function contactPlaceholder(type: ContactType): string {
  if (type === "instagram") return "예: cju_signal";
  if (type === "kakao") return "예: cheongdae123";
  return "예: 010-1234-5678";
}

export function contactHelp(type: ContactType): string {
  if (type === "instagram") return "@를 제외하고 입력해주세요. 선택한 상대에게만 공개됩니다.";
  if (type === "kakao") return "카카오톡 ID를 정확히 입력해주세요. 선택한 상대에게만 공개됩니다.";
  return "숫자만 입력해도 자동으로 정리됩니다. 선택한 상대에게만 공개됩니다.";
}

export function formatContactValue(value: string, type: ContactType): string {
  if (type !== "phone") return value;
  if (value.length === 10) return `${value.slice(0, 3)}-${value.slice(3, 6)}-${value.slice(6)}`;
  return `${value.slice(0, 3)}-${value.slice(3, 7)}-${value.slice(7)}`;
}
