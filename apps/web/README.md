# Vera web

A TanStack Start messaging client that reads one private conversation across
independent Convex PDS deployments.

## Code tour

- `features/account/AccountEntry.tsx` discovers a PDS from `username@domain`.
- `features/account/AccountSession.tsx` owns the local auth session and creates
  the decentralized client.
- `features/pds/auth.ts` is the replaceable Better Auth federation adapter.
- `features/pds/model.ts` contains the explicitly temporary two-home fixture.
- `features/conversation/useConversation.ts` is the complete data path.
- `features/conversation/Conversation.tsx` is presentation only.

```sh
pnpm --filter @vera/web dev
```

Open `https://www.vera.localhost` and:

1. Enter a full Vera address such as `alice@a.vera.chat`.
2. Create or sign into that account on its discovered home PDS.
3. Send messages. Vera reads the conversation from both development PDSs with
   the one home login.

Home discovery happens before sign-in. The address entry screen resolves the
account domain and keeps that verified descriptor as `home`; both auth and the
decentralized client use the same value:

```ts
const home = assertPdsCompatibility(
  await discoverPds("alice@a.vera.chat"),
  pds,
);

const authClient = createHomeAuthClient(home);
const client = new DecentralizedConvexClient({
  getAuthToken,
  pds: { home },
});
```

Signing in creates the authenticated session on that already-discovered home.
It does not produce or replace the `home` value.

Each signup and outgoing message is stored only on the selected home
deployment. Each home keeps its own isolated Better Auth and Messages Component
data. The home PDS issues a short-lived, destination-bound identity proof; the
other PDS verifies it through discovery and returns a local Convex credential.
The selected account stores its conversation routing identities on its own PDS.
The client first subscribes there, discovers the current participant PDSs from
that response, then opens authenticated subscriptions and reconciles the
results through TanStack Query.

The account address uses the PDS's public account domain, never its internal
`convex.cloud` transport hostname. Better Auth is Vera's current host adapter,
not a dependency of the reusable decentralized Convex packages.

The checked-in `.env.example` documents the deployment configuration. Deploy
the same `convex/` backend to each target and set `SITE_URL` and
`FEDERATION_DOMAIN` on each deployment. Publish the single `_pds` TXT discovery
record described in the backend README. Free and Pro Convex deployments use the
same discovery flow; Convex custom domains are optional.

The web app imports the typed `pds` API derived from Vera's backend app
definition. It does not declare a second plugin list or import either
deployment's generated message API; both homes expose the same canonical
`pds:dispatchQuery` and `pds:dispatchMutation` functions.

The common read and write paths use the application's own TanStack hooks:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

const messages = useQuery(pdsQuery(pds.messages.list, { conversationId }));

const sendMessage = useMutation(pdsMutation(pds.messages.send));
```
