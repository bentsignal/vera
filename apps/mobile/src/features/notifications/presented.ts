import * as Notifications from "expo-notifications";

function asString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

/** A string field of a notification's `data`, if it has one. */
export function stringField(data: unknown, field: string) {
  return typeof data === "object" && data !== null
    ? asString(Reflect.get(data, field))
    : undefined;
}

/**
 * When the notification arrived, in milliseconds. iOS reports seconds and
 * Android milliseconds.
 */
export function deliveredAt(notification: Notifications.Notification) {
  const { date } = notification;
  return date < 100_000_000_000 ? date * 1000 : date;
}

/** Removes the delivered notifications that `isDone` picks. */
export async function dismissPresented(
  isDone: (notification: Notifications.Notification) => boolean,
) {
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter(isDone)
      .map((notification) =>
        Notifications.dismissNotificationAsync(notification.request.identifier),
      ),
  );
}

/**
 * Clears a signed-out account's notifications, and the app icon badge once
 * no account is left to count it.
 */
export async function forgetAccountNotifications(
  address: string,
  accountsLeft: number,
) {
  await dismissPresented(
    (notification) =>
      stringField(notification.request.content.data, "accountId") === address,
  );
  if (accountsLeft === 0) await Notifications.setBadgeCountAsync(0);
}
