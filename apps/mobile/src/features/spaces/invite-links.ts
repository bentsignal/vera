import { Platform, Share } from "react-native";
import Constants from "expo-constants";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** How long a new invite link lasts. */
export const EXPIRATIONS = [
  { label: "15 Minutes", ms: 15 * MINUTE, value: "15m" },
  { label: "30 Minutes", ms: 30 * MINUTE, value: "30m" },
  { label: "1 Hour", ms: HOUR, value: "1h" },
  { label: "1 Day", ms: DAY, value: "1d" },
  { label: "1 Week", ms: 7 * DAY, value: "7d" },
  { label: "1 Month", ms: 30 * DAY, value: "30d" },
  { label: "Never", ms: undefined, value: "never" },
] as const;

export type Expiration = (typeof EXPIRATIONS)[number]["value"];

export const DEFAULT_EXPIRATION = "7d" satisfies Expiration;

/**
 * The shareable link for an invite code. Vera opens `vera.chat/join/…`
 * and Vera Dev opens `vera.chat/dev/join/…` (see `+native-intent.ts`), so
 * a link always opens the app whose server made it.
 */
export function inviteLinkUrl(code: string) {
  const dev = Constants.expoConfig?.scheme === "vera-dev";
  return `https://vera.chat/${dev ? "dev/" : ""}join/${code}`;
}

function plural(count: number, unit: string) {
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
}

/** "Expires in 3 days", "Expires in 12 minutes", or "Never expires". */
export function describeExpiry(expiresAt: number | null, now = Date.now()) {
  if (expiresAt === null) return "Never expires";
  const left = expiresAt - now;
  if (left <= 0) return "Expired";
  // Rounded, so a day-long link reads "1 day" rather than "24 hours".
  const minutes = Math.max(1, Math.round(left / MINUTE));
  if (minutes < 60) return `Expires in ${plural(minutes, "minute")}`;
  const hours = Math.round(left / HOUR);
  if (hours < 24) return `Expires in ${plural(hours, "hour")}`;
  return `Expires in ${plural(Math.round(left / DAY), "day")}`;
}

/** Opens the share sheet for a link (iOS shares it as a URL). */
export function shareInviteLink(url: string) {
  void Share.share(Platform.OS === "ios" ? { url } : { message: url }).catch(
    () => undefined,
  );
}
