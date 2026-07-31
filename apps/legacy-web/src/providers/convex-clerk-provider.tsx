import type { ReactNode } from "react";
// eslint-disable-next-line no-restricted-imports -- Convex stores fetchAccessToken by reference; a stable identity avoids pauseSocket/resumeSocket thrash on every render
import { useCallback, useEffect, useRef } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { useAuth } from "@clerk/tanstack-react-start";
import { ConvexProvider } from "convex/react";

export function ConvexClerkProvider({ children }: { children: ReactNode }) {
  const { convex } = useRouteContext({
    from: "__root__",
    select: (ctx) => ({ convex: ctx.convex }),
  });
  const { isLoaded, isSignedIn, getToken, sessionClaims } = useAuth();

  const audIsConvex = sessionClaims?.aud === "convex";
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      const options = audIsConvex
        ? { skipCache: forceRefreshToken }
        : { template: "convex", skipCache: forceRefreshToken };
      let token: string | null;
      try {
        token = await getToken(options);
      } catch {
        token = null;
      }
      if (token === null) return null;
      return token;
    },
    [getToken, audIsConvex],
  );

  // Replaces convex/react-clerk's ConvexProviderWithClerk. The upstream
  // provider fires `client.clearAuth()` on signed-in → signed-out, which
  // makes the Convex server re-evaluate every live authed subscription
  // without auth — producing Unauthenticated errors during sign-out and
  // account deletion. Here we skip that teardown; useSignOut and the delete
  // flow hard-nav via window.location, which drops the WebSocket cleanly.
  const wasSignedInRef = useRef<boolean | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- mirroring external Clerk auth state onto the Convex client
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      wasSignedInRef.current = true;
      convex.setAuth(fetchAccessToken);
      return;
    }
    // Fresh signed-out client: resume the socket paused by `expectAuth: true`
    // so public queries can fire. On signed-in → signed-out: do nothing —
    // setAuth/clearAuth would trigger the server re-eval we're avoiding.
    if (wasSignedInRef.current !== true) {
      convex.setAuth(() => Promise.resolve(null));
    }
    wasSignedInRef.current = false;
  }, [convex, isLoaded, isSignedIn, fetchAccessToken]);

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
