import { pds } from "@vera/backend/pds";

import type { AccountSession } from "~/features/session/account-session";
import { getPushToken } from "~/features/notifications/push";
import { closeAccountSession } from "~/features/session/account-session";

/**
 * Stops this device's notifications for the account, ends its session, and
 * forgets it here. Other signed-in accounts stay signed in.
 */
export async function signOutAccount(session: AccountSession) {
  const token = await getPushToken().catch(() => null);
  if (token !== null) {
    await session.pds
      .mutate(pds.messages.unregisterPushToken({ token }))
      .catch(() => null);
  }
  await session.authClient.signOut().catch(() => null);
  closeAccountSession(session);
}
