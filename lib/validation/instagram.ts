import { INSTAGRAM_ID_REGEX } from "@/lib/constants";

export function sanitizeInstagramId(raw: string): string {
  return raw.trim().replace(/^@/, "");
}

export function isValidInstagramId(id: string): boolean {
  return INSTAGRAM_ID_REGEX.test(id);
}
