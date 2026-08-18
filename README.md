# Vera

Vera is the reference application and current incubator for decentralized
Convex: a small toolkit for building applications whose data and realtime
subscriptions span independently hosted Convex deployments.

The current branch proves one private, reactive conversation across two PDSs.
It is intentionally a vertical slice, not a production messaging product yet.

## Start here

Read these files in order to follow one request end to end:

1. `packages/decentralized-convex-messages/protocol.ts` defines the typed
   Messages API and its dependency on Accounts.
2. `services/backend/convex/convex.config.ts` installs Better Auth, Accounts,
   and Messages in one validated PDS app.
3. `services/backend/convex/pds.ts` exposes the canonical public dispatcher.
4. `packages/decentralized-convex-messages/dispatcher.ts` implements the
   Messages operations inside its Component.
5. `apps/web/src/features/conversation/useConversation.ts` shows the complete
   client API used for reactive reads and writes.

The longer explanation is in [docs/architecture.md](docs/architecture.md).
The lockstep `0.1.0` release and upgrade rules are in
[docs/versioning.md](docs/versioning.md).

## The default setup

A PDS installs ordinary third-party Components and decentralized-convex
plugins declaratively:

```ts
import betterAuth from "@convex-dev/better-auth/convex.config";
import accounts from "@decentralized-convex/accounts/convex.config";
import messages from "@decentralized-convex/messages/convex.config";
import { definePdsApp } from "@decentralized-convex/server";

export default definePdsApp({
  components: [betterAuth],
  plugins: [accounts, messages],
});
```

Messages declares an exact dependency on Accounts at the shared ecosystem
version. Removing Accounts or
installing an incompatible version fails type-checking. The normal
`convex dev`, `convex deploy`, and `convex codegen` commands remain unchanged.

The common client path uses the application's own TanStack hooks:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";
import { pds } from "@vera/backend/pds";

const messages = useQuery(
  pdsQuery({
    args: { conversationId },
    query: pds.messages.list,
  }),
);
const sendMessage = useMutation(
  pdsMutation({ mutation: pds.messages.send }),
);
```

The backend's `pds` export derives its plugin names, versions, operations, and
types from the same `definePdsApp` declaration. The web app never repeats the
installed plugin list, and the discovery manifest derives its capabilities
from the same protocol tuple.

The query starts at the signed-in account's home PDS, reads routing identities
stored with the conversation, discovers their current deployments, and merges
live results. Mutations automatically target home. Ordinary TanStack options,
connection factories, explicit lower-level federation, and destination-aware
authentication remain available when an application needs control.

## Workspace

- `packages/decentralized-convex-plugin` — operation protocols and dependency
  graph validation
- `packages/decentralized-convex-core` — the single ecosystem version and
  last-changed release metadata
- `packages/decentralized-convex-server` — PDS installation, root dispatch,
  Component dispatch, and discovery descriptors
- `packages/decentralized-convex-client` — discovery, connections, typed calls,
  federation, and subscriptions
- `packages/decentralized-convex-react` — client provider
- `packages/decentralized-convex-tanstack-query` — native TanStack option builders
- `packages/decentralized-convex-accounts` and `-messages` — first-party plugins
- `services/backend` — Vera's thin Better Auth PDS host
- `apps/web` — the Vera reference client
- `legacy` — the archived centralized Vera application

## Development

```sh
pnpm install
pnpm --filter @vera/web dev
```

The web app runs at `https://www.vera.localhost`.
