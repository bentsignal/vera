// State updates from animations (a row has faded in, say), run together in
// the next frame, so ten rows finishing at once redraw the list once
// instead of ten times. Each update scheduled from the UI thread is a
// separate task on the JavaScript thread, which React can't batch.

const waiting = new Array<() => void>();

/** Runs `update` in the next frame, with any others waiting for it. */
export function inNextFrame(update: () => void) {
  waiting.push(update);
  if (waiting.length > 1) return;
  requestAnimationFrame(() => {
    for (const run of waiting.splice(0)) run();
  });
}
