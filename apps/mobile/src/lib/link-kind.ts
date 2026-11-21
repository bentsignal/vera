/**
 * What kind of address a link is, for the only kinds the app opens: web
 * pages, email, and phone numbers. Links come from other people's messages
 * and their servers, so anything else (an Android `intent:` address that
 * starts some other app's screen, `file:`, `javascript:`, an app's own
 * scheme) isn't opened at all.
 */
export function linkKind(url: string) {
  let scheme: string;
  try {
    scheme = new URL(url.trim()).protocol;
  } catch {
    return undefined;
  }
  switch (scheme) {
    case "http:":
    case "https:":
      return "web";
    case "mailto:":
      return "email";
    case "tel:":
      return "phone";
    default:
      return undefined;
  }
}
