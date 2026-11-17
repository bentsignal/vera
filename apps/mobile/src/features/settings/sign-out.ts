import { pds } from "@vera/backend/pds";

import type { AccountSession } from "~/features/session/account-session";
import type { StoredAccount } from "~/features/session/account-store";
import { forgetDrafts } from "~/features/conversation/drafts";
import { forgetAccountNotifications } from "~/features/notifications/presented";
import { getPushToken } from "~/features/notifications/push";
import {
  closeAccountSession,
  forgetUnreachableAccount,
} from "~/features/session/account-session";
import {
  removeStoredAccount,
  storedAccounts,
} from "~/features/session/account-store";

/**
 * Forgets the account here right away, so the accounts list is already
 * updated when the screen that signed out closes. Then, in the
 * background, stops this device's notifications for it and ends its
 * session. Other signed-in accounts stay signed in.
 */
export function signOutAccount(session: AccountSession) {
  removeStoredAccount(session.address);
  forgetDrafts(session.address);
  void endSession(session);
}

async function endSession(session: AccountSession) {
  const token = await getPushToken().catch(() => null);
  if (token !== null) {
    await session.pds
      .mutate(pds.messages.unregisterPushToken({ token }))
      .catch(() => null);
  }
  await session.authSignOut().catch(() => null);
  closeAccountSession(session);
}

/**
 * Forgets an account whose home PDS can't be reached. Its session can't be
 * ended there, so this only removes it from this device.
 */
export function removeUnreachableAccount(account: StoredAccount) {
  forgetUnreachableAccount(account);
  forgetDrafts(account.address);
  void forgetAccountNotifications(
    account.address,
    storedAccounts().length,
  ).catch(() => null);
}
