export const ACCOUNT_RETENTION_MONTHS = 6;

export function accountRetentionCutoff(now = new Date()): Date {
  const cutoff = new Date(now);
  const originalDay = cutoff.getUTCDate();
  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - ACCOUNT_RETENTION_MONTHS);
  const daysInTargetMonth = new Date(Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  cutoff.setUTCDate(Math.min(originalDay, daysInTargetMonth));
  return cutoff;
}

export function isAccountRetentionExpired(
  lastActiveAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (!lastActiveAt) return true;
  const lastActive = new Date(lastActiveAt).getTime();
  return !Number.isFinite(lastActive) || lastActive < accountRetentionCutoff(now).getTime();
}

/**
 * 계정 보유 동의의 6개월 기한과 현재 회차의 참가 데이터 보유 기간은 별개다.
 * 현재 회차가 진행 중이면 카드·매칭을 계정과 함께 삭제하지 않는다.
 * 마지막 참여일을 갱신하지 않으므로 종료 뒤에는 원래 기한으로 정리된다.
 */
export function hasActiveEventParticipation(
  participant: unknown,
  config: { ends_at: string; purging: boolean } | null | undefined,
  now = new Date(),
): boolean {
  return participant != null &&
    config?.purging === false &&
    Date.parse(config.ends_at) > now.getTime();
}
