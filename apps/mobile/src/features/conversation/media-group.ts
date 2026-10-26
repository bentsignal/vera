// A message's photos and videos as the viewer's group, passed to `/media`
// as a route param (see `MediaGroupViewer`).

/** One photo or video of a message's group, as the viewer shows it. */
export interface ViewerItem {
  readonly kind: "image" | "video";
  readonly url: string;
  readonly width?: number;
  readonly height?: number;
  /** A video's poster, shown until it's played. */
  readonly poster?: string;
}

/** The group as a route param, and back (see `/media`). */
export function groupParam(items: readonly ViewerItem[]) {
  return JSON.stringify(items);
}

function isKind(kind: unknown) {
  return kind === "image" || kind === "video";
}

function isItem(value: unknown): value is ViewerItem {
  if (typeof value !== "object" || value === null) return false;
  return (
    isKind(Reflect.get(value, "kind")) &&
    typeof Reflect.get(value, "url") === "string"
  );
}

function itemsOf(parsed: unknown) {
  return Array.isArray(parsed) && parsed.every(isItem) ? parsed : undefined;
}

export function parseGroup(param: string | undefined) {
  if (param === undefined) return undefined;
  try {
    return itemsOf(JSON.parse(param));
  } catch {
    return undefined;
  }
}
