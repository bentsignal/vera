// Opening media from the native list once per tap (see `useOpenMedia`).

// `opening`: media opened from the list is on its way or showing, from
// the press that opens it until the list's screen is back in focus. A very
// fast repeat on a photo can reach JavaScript as two presses while the list
// is still showing, and each would push its own viewer.

/**
 * A press on media: it opens unless media opened from here is still on
 * its way or showing.
 */
export function pressMedia(opening: boolean) {
  return { opening: true, opens: !opening };
}

/** The list's screen is in focus again: the next press opens at once. */
export function listFocused() {
  return false;
}
