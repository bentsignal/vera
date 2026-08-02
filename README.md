# Vera

Vera is a decentralized messaging application built on independently hosted
Convex deployments. The active application also serves as the real-world
incubator for the decentralized Convex toolkit while its API is still changing
quickly.

## Workspace

- `apps/web` — the TanStack Start Vera client
- `services/backend` — the Convex backend deployed to each Vera server
- `packages/decentralized-convex-*` — reusable federation packages
- `shared` — private code shared by Vera workspace projects
- `deps` — source dependencies that Vera may need to maintain directly
- `legacy` — the archived centralized Vera application

The standalone decentralized-convex repository remains intact as a milestone.
During incubation, changes are developed and exercised here without an npm
publish/install cycle.

## Development

Install dependencies and start the active app:

```sh
pnpm install
pnpm --filter @vera/web dev
```

The web app runs at `http://localhost:5173`. Copy the checked-in environment
examples before connecting different Convex deployments.
