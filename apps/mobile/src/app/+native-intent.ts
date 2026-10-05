/**
 * Vera opens invite links at `vera.chat/join/<code>` and Vera Dev at
 * `vera.chat/dev/join/<code>`, so each app claims only its own server's
 * links. Both show them at `/join/<code>`, as do `vera://join/<code>` links
 * from the vera.chat page that opens the app.
 */
export function redirectSystemPath({ path }: { path: string }) {
  const code = /\/(?:dev\/)?join\/([A-Za-z0-9]+)/.exec(path)?.[1];
  return code === undefined ? path : `/join/${code}`;
}
