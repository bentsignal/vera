/** How long signing out waits for the server before forgetting the account anyway. */
export const SERVER_SIGN_OUT_WAIT_MS = 5_000;

/**
 * Tells the server an account is signing out, as far as it can be reached
 * in `waitMs`, then forgets the account on this device whatever happened.
 * Offline, the server calls never finish (a mutation waits for the
 * connection to come back), so they can't hold up forgetting it.
 */
export async function endSessionWithin(
  serverSteps: readonly Promise<unknown>[],
  forget: () => void,
  waitMs = SERVER_SIGN_OUT_WAIT_MS,
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const waited = new Promise((resolve) => {
    timer = setTimeout(resolve, waitMs);
  });
  // Neither of these rejects, so `forget` always runs.
  await Promise.race([Promise.allSettled(serverSteps), waited]);
  clearTimeout(timer);
  forget();
}
