# Vera

Vera is a decentralized messaging application built on independently hosted
Convex deployments. The active application also serves as the real-world
incubator for the decentralized Convex toolkit while its API is still changing
quickly.

## Workspace

- `apps/web` — the TanStack Start Vera client
- `services/backend` — the Convex backend deployed to each Vera server
- `packages/decentralized-convex-accounts` — reusable PDS account profiles
- `packages/decentralized-convex-messages` — reusable authenticated messaging
- `packages/decentralized-convex-*` — shared protocols, routing, and clients
- `shared` — private code shared by Vera workspace projects
- `deps` — source dependencies that Vera may need to maintain directly
- `legacy` — the archived centralized Vera application

The active backend consumes the reusable Components through their workspace
package exports exactly as an external PDS would. Vera-specific code remains in
the app and service folders; the Components do not import Vera.

## Development

Install dependencies and start the active app:

```sh
pnpm install
pnpm --filter @vera/web dev
```

The web app runs at `https://www.vera.localhost`. Copy the checked-in environment
examples before connecting different Convex deployments.
