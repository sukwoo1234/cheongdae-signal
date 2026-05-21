const BANNED_WORDS = [
  "씨발", "시발", "ㅅㅂ", "병신", "ㅂㅅ", "좆", "ㅈ까", "지랄",
  "개새끼", "걸레", "창녀", "fuck", "shit", "asshole",
];

const normalize = (s: string) => s.toLowerCase().replace(/\s/g, "");

export function containsProfanity(text: string): boolean {
  const normalized = normalize(text);
  return BANNED_WORDS.some((w) => normalized.includes(normalize(w)));
}
