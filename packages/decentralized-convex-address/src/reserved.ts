/**
 * Usernames a PDS should keep for its operator, because an account with one
 * of these names looks like it speaks for the server (`support@example.chat`).
 * Hosts pass this list, plus their own names, to `isReservedUsername` when
 * someone signs up. The operator can still create these accounts.
 */
export const DEFAULT_RESERVED_USERNAMES: readonly string[] = Object.freeze([
  "abuse",
  "account",
  "accounts",
  "admin",
  "administrator",
  "all",
  "announcements",
  "anonymous",
  "api",
  "app",
  "billing",
  "bot",
  "compliance",
  "contact",
  "customer_service",
  "customer_support",
  "dev",
  "developer",
  "developers",
  "everyone",
  "feedback",
  "help",
  "help_desk",
  "hostmaster",
  "info",
  "legal",
  "mail",
  "mailer_daemon",
  "mod",
  "moderator",
  "moderators",
  "mods",
  "news",
  "no_reply",
  "notifications",
  "null",
  "official",
  "operator",
  "owner",
  "password",
  "payments",
  "pds",
  "postmaster",
  "press",
  "privacy",
  "root",
  "safety",
  "security",
  "server",
  "service",
  "settings",
  "sign_in",
  "sign_up",
  "staff",
  "status",
  "sudo",
  "superuser",
  "support",
  "sysadmin",
  "system",
  "team",
  "trust_and_safety",
  "undefined",
  "verification",
  "verified",
  "verify",
  "webmaster",
  "www",
]);

/**
 * Whether `username` is one of `reserved`. Separators and trailing digits
 * are ignored on both sides, so `help_desk`, `helpdesk`, and `help-desk2`
 * all match `help_desk`.
 */
export function isReservedUsername(
  username: string,
  reserved: Iterable<string> = DEFAULT_RESERVED_USERNAMES,
) {
  const key = reservationKey(username);
  for (const name of reserved) {
    if (reservationKey(name) === key) return true;
  }
  return false;
}

function reservationKey(username: string) {
  return username
    .trim()
    .toLowerCase()
    .replace(/[._-]/g, "")
    .replace(/\d+$/, "");
}
