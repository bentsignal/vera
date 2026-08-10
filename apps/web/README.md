# Vera web

A TanStack Start messaging client that reads one private conversation across
independent Convex PDS deployments.

```sh
pnpm --filter @vera/web dev
```

Open `https://www.vera.localhost` and:

1. Enter a full Vera address such as `alice@a.vera.chat`.
2. Create or sign into that account on its discovered home PDS.
3. Send messages. Vera reads the conversation from both development PDSs with
   the one home login.

Each signup and outgoing message is stored only on the selected home
deployment. Each home keeps its own isolated Better Auth and Messages Component
data. The home PDS issues a short-lived, destination-bound identity proof; the
other PDS verifies it through discovery and returns a local Convex credential.
The client opens an authenticated subscription to each home and reconciles both
results through TanStack Query.

The account address uses the PDS's public account domain, never its internal
`convex.cloud` transport hostname. Better Auth is Vera's current host adapter,
not a dependency of the reusable decentralized Convex packages.

The checked-in `.env.example` documents the deployment configuration. Deploy
the same `convex/` backend to each target and set `SITE_URL` and
`FEDERATION_DOMAIN` on each deployment. Publish the single `_pds` TXT discovery
record described in the backend README. Free and Pro Convex deployments use the
same discovery flow; Convex custom domains are optional.

The web app imports only the product-agnostic Messages protocol. It does not
import either deployment's generated message API; both homes expose the same
canonical `pds:dispatchQuery` and `pds:dispatchMutation` functions.
