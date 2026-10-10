/**
 * Signed in, the dev sign-in link (`/dev-sign-in?username=…`, with or
 * without the app's scheme) opens Add Account's copy of the screen, since
 * the signed-out one isn't reachable then.
 */
export function devSignInPath(path: string, signedIn: boolean) {
  return signedIn
    ? path.replace(/^([\w-]+:\/\/)?\/dev-sign-in/, "$1/add-account/dev-sign-in")
    : path;
}
