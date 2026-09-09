import type { PostitColor } from "./constants";

export type Gender = "M" | "F";

export interface User {
  id: string;
  email: string;
  gender: Gender | null;
  terms_accepted_at: string | null;
  privacy_accepted_at: string | null;
  banned: boolean;
  banned_reason: string | null;
  created_at: string;
}

export interface Card {
  id: string;
  user_id: string;
  one_liner: string;
  instagram_id: string;
  color: PostitColor;
  hidden_by_user: boolean;
  hidden_by_admin: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardCard {
  id: string;
  one_liner: string;
  color: PostitColor;
}

/** my_card() RPC 반환 형태. cards 테이블 전체가 아니라 본인에게 허용된 필드만 담긴다. */
export interface MyCard {
  id: string;
  one_liner: string;
  instagram_id: string;
  color: PostitColor;
  hidden_by_user: boolean;
  hidden_by_admin: boolean;
}

export interface Match {
  id: string;
  viewer_user_id: string;
  viewed_card_id: string;
  created_at: string;
  bonus: boolean;
}

/** my_matches() RPC 반환 형태. */
export interface MyMatch {
  match_id: string;
  card_id: string;
  one_liner: string;
  color: PostitColor;
  instagram_id: string;
  bonus: boolean;
  created_at: string;
}

export interface SessionConfig {
  id: 1;
  event_id: string;
  starts_at: string;
  ends_at: string;
  threshold_male: number;
  threshold_female: number;
  force_locked: boolean;
  purging: boolean;
  /** 개인정보 처리방침과 동일하게 카드 소유자당 공개 가능한 최대 인원. */
  max_views_per_card: number;
}

export interface SlotState {
  allowance: number;
  used: number;
  remaining: number;
}

export interface SessionState {
  config: SessionConfig;
  counts: { male: number; female: number };
  board_open: boolean;
  in_pregating: boolean;
  in_postsession: boolean;
  time_to_end_seconds: number;
}
