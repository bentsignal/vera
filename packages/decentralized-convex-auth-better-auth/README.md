# `@decentralized-convex/auth-better-auth`

Adapts a normally configured Better Auth instance to the public decentralized
Convex authentication protocol. The adapter does not own Better Auth's
database, providers, sessions, callbacks, or UI.

```ts
import betterAuthComponent from "@convex-dev/better-auth/convex.config";
import { betterAuthAdapter } from "@decentralized-convex/auth-better-auth";
import { betterAuthPdsPlugin } from "@decentralized-convex/auth-better-auth/runtime";

export const pdsAuth = betterAuthAdapter({
  accountDomain: () => env.FEDERATION_DOMAIN,
  component: betterAuthComponent,
  issuer: () => env.CONVEX_SITE_URL,
});

export default definePdsApp({
  auth: pdsAuth,
  plugins: [accounts, messages],
});

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    // Every normal Better Auth option remains available.
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: true },
    plugins: [convex(...), betterAuthPdsPlugin(pdsAuth)],
  });
}
```
