import type { ReactNode } from "react";
import {
  createRootRouteWithContext,
  HeadContent,
  Outlet,
  Scripts,
  useNavigate,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { ClerkProvider, useAuth } from "@clerk/tanstack-react-start";
import { auth } from "@clerk/tanstack-react-start/server";
import { dark } from "@clerk/themes";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { Toaster } from "sonner";
import { z } from "zod";

import { LoginModal } from "@acme/features/auth";

import type { RouterContext } from "~/router";
import appStyles from "~/app/styles.css?url";
import { env } from "~/env";

const fetchClerkAuth = createServerFn({ method: "GET" }).handler(async () => {
  const { userId, getToken, isAuthenticated } = await auth();
  const token = userId
    ? ((await getToken({ template: "convex" })) ?? null)
    : null;

  if (isAuthenticated && token) {
    return {
      isSignedIn: true,
      userId,
      token,
    };
  }
  return {
    isSignedIn: false,
  };
});

export const Route = createRootRouteWithContext<RouterContext>()({
  validateSearch: z.object({
    signin: z.boolean().optional(),
    redirect_url: z.string().optional(),
  }),
  head: () => ({
    links: [{ rel: "stylesheet", href: appStyles }],
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "XR - Vera" },
      {
        name: "description",
        content: "How can I help you today?",
      },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const authState = await fetchClerkAuth();

    if (authState.isSignedIn) {
      context.convexQueryClient.serverHttpClient?.setAuth(authState.token);
      context.convexHttpClient.setAuth(authState.token);
    } else {
      context.convexHttpClient.clearAuth();
    }

    const { token: _token, ...auth } = authState;

    return { auth };
  },
  component: RootComponent,
});

function ConvexClerkProvider({ children }: { children: ReactNode }) {
  const { convex } = Route.useRouteContext({
    select: (ctx) => ({ convex: ctx.convex }),
  });
  const authState = useAuth();
  return (
    <ConvexProviderWithClerk client={convex} useAuth={() => authState}>
      {children}
    </ConvexProviderWithClerk>
  );
}

function RootComponent() {
  const { auth: authState } = Route.useRouteContext({
    select: (ctx) => ({ auth: ctx.auth }),
  });
  const signin = Route.useSearch({ select: (s) => s.signin ?? false });
  const redirectUrl = Route.useSearch({ select: (s) => s.redirect_url });
  const navigate = useNavigate();

  function closeLoginModal() {
    void navigate({
      to: ".",
      search: (prev) => ({
        ...prev,
        signin: undefined,
        redirect_url: undefined,
      }),
    });
  }

  return (
    <ClerkProvider
      appearance={{ baseTheme: dark }}
      afterSignOutUrl="/sign-in"
      signInUrl="/sign-in?signin=true"
      signUpUrl="/sign-in?signin=true"
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <ConvexClerkProvider>
        <html
          lang="en"
          suppressHydrationWarning
          className="dark"
          style={{ colorScheme: "dark" }}
        >
          <head>
            <HeadContent />
          </head>
          <body className="font-main relative overflow-hidden antialiased">
            <Outlet />
            <LoginModal
              open={!authState.isSignedIn && signin}
              onClose={closeLoginModal}
              redirectUri={redirectUrl}
              tosURL={`${env.VITE_WEB_APP_URL}/terms-of-service`}
              privacyURL={`${env.VITE_WEB_APP_URL}/privacy-policy`}
            />
            <Toaster />
            <Scripts />
          </body>
        </html>
      </ConvexClerkProvider>
    </ClerkProvider>
  );
}
