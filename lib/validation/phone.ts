import { PHONE_REGEX } from "@/lib/constants";

export function containsPhoneNumber(text: string): boolean {
  return PHONE_REGEX.test(text.replace(/\s/g, ""));
}
