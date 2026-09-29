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
