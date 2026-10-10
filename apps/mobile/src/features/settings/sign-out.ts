import { pds } from "@vera/backend/pds";

import type { AccountSession } from "~/features/session/account-session";
import { getPushToken } from "~/features/notifications/push";
import { closeAccountSession } from "~/features/session/account-session";
import { removeStoredAccount } from "~/features/session/account-store";

/**
 * Forgets the account here right away, so the accounts list is already
 * updated when the screen that signed out closes. Then, in the
 * background, stops this device's notifications for it and ends its
 * session. Other signed-in accounts stay signed in.
 */
export function signOutAccount(session: AccountSession) {
  removeStoredAccount(session.address);
  void endSession(session);
}

async function endSession(session: AccountSession) {
  const token = await getPushToken().catch(() => null);
  if (token !== null) {
    await session.pds
      .mutate(pds.messages.unregisterPushToken({ token }))
      .catch(() => null);
  }
  await session.authClient.signOut().catch(() => null);
  closeAccountSession(session);
}
