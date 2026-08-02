# Vera backend

This Convex service is the backend installed on each Vera home server. The same
schema and functions can be deployed to multiple independent Convex deployments.

For local federation testing, create `.env.a.local` and `.env.b.local` from
`.env.example`, then deploy each target:

```sh
pnpm --filter @vera/backend deploy:a
pnpm --filter @vera/backend deploy:b
```

Each deployment needs its own `FEDERATION_DOMAIN`. Better Auth is the current
Vera authentication choice; the decentralized Convex packages remain auth
provider agnostic.
