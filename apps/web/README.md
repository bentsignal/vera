# Vera web

A TanStack Start messaging client that reads one conversation across independent
Convex deployments.

```sh
pnpm --filter @vera/web dev
```

Open `http://localhost:5173` and:

1. Choose a Convex deployment and create a username and password.
2. Open a second tab.
3. Choose the other deployment and create another account.
4. Send messages in either tab.

Each signup and outgoing message is stored only on the selected home
deployment. Both tabs run the same federated query against both deployments and
combine the results through TanStack Query.

The account address is derived from the selected deployment, such as
`alice@your-a-deployment.convex.cloud`. The user chooses only `alice`; the
server owns the domain. Better Auth is used by this example, not required by the
decentralized-convex packages.

The checked-in `.env.example` documents the required deployment URLs. Deploy
the same `convex/` backend to each target and set `SITE_URL` and
`FEDERATION_DOMAIN` on each deployment. `FEDERATION_DOMAIN` must be the
deployment's actual `.convex.cloud` hostname or its configured custom hostname.
Reads are intentionally public in this auth-development room; portable
private-read authorization is not implemented.
