/**
 * Swiping sideways through a group of photos in the viewer (see `Pager`
 * in photo-viewer-state.ts): where the pages are, which one a swipe goes
 * to, and which are mounted. Plain math, so it's tested on its own.
 */

/** How far a swipe goes past the first or last page, as a fraction. */
export const PAGE_BAND = 0.25;
/** A sideways flick this fast (points a second) turns the page. */
export const PAGE_FLICK = 500;

/**
 * Where the pager is with the finger `dx` points across from where it was
 * on page `from`, rubber-banded past the first and last pages. `dx` is in
 * window terms, not the swiped page's own: that page moves with the
 * finger, and its own coordinates fed its movement back in, so it
 * followed at half the finger's speed and wobbled.
 */
export function pagePosition(
  from: number,
  dx: number,
  width: number,
  count: number,
) {
  "worklet";
  const raw = from - dx / Math.max(width, 1);
  const last = count - 1;
  const over = raw < 0 ? raw : raw > last ? raw - last : 0;
  return raw - over + Math.sign(over) * Math.min(Math.abs(over), PAGE_BAND);
}

/**
 * The page a sideways swipe goes to when it's let go, `dx` points across
 * from where it began at `from`. A flick, or a drag of more than a third
 * of a page, turns the page from the one it began nearest (where the last
 * swipe was going); a shorter drag settles on the nearest page. `from` is fractional when a swipe caught the last one's spring
 * (see `catchPage`), so it carries on from there instead of jumping to a
 * whole page first.
 */
export function pageTarget({
  from,
  dx,
  speedX,
  width,
  count,
}: {
  from: number;
  dx: number;
  speedX: number;
  width: number;
  count: number;
}) {
  "worklet";
  const moved = -dx / Math.max(width, 1);
  const page = Math.round(from);
  const target =
    Math.abs(speedX) > PAGE_FLICK
      ? page - Math.sign(speedX)
      : Math.abs(moved) > 1 / 3
        ? page + Math.sign(moved)
        : Math.round(from + moved);
  return Math.min(count - 1, Math.max(0, target));
}

/**
 * The pages mounted around `index`: it and its neighbors, so a swipe has
 * the next one ready. `index` moves to a swipe's target as it's let go,
 * not once it lands, so a second swipe during the first's spring finds
 * its page there.
 */
export function pagesAround(index: number, count: number) {
  return [index - 1, index, index + 1].filter(
    (page) => page >= 0 && page < count,
  );
}
