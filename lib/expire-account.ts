import type { createAdminClient } from "@/lib/supabase/admin";
import { accountRetentionCutoff } from "@/lib/account-retention";

/**
 * The database decides whether expiry is still valid under row locks. A
 * deadlock aborts the entire transaction, so one bounded retry is safe.
 */
export async function expireRetainedAccount(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const args = {
    p_user_id: userId,
    p_cutoff: accountRetentionCutoff().toISOString(),
  };
  let result = await admin.rpc("expire_retained_account_if_eligible", args);
  if (result.error?.code === "40P01") {
    await new Promise((resolve) => setTimeout(resolve, 30));
    result = await admin.rpc("expire_retained_account_if_eligible", args);
  }
  return result;
}
