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

Messages declares `requires: { accounts: "1" }`. Removing Accounts or
installing an incompatible version fails type-checking. The normal
`convex dev`, `convex deploy`, and `convex codegen` commands remain unchanged.

The common client path is similarly small:

```ts
import { pds } from "@vera/backend/pds";

const messages = usePdsQuery({
  request: pds.messages.list({ conversationId }),
  targets,
});
```

The backend's `pds` export derives its plugin names, versions, operations, and
types from the same `definePdsApp` declaration. The web app never repeats the
installed plugin list, and the discovery manifest derives its capabilities
from the same protocol tuple.

`usePdsQuery` supplies a stable query key, connection reuse, realtime
subscriptions, array merging, and per-PDS status by default. `combine`,
`queryKey`, `enabled`, connection factories, and destination-aware auth remain
available when an application needs control.

## Workspace

- `packages/decentralized-convex-plugin` — operation protocols and dependency
  graph validation
- `packages/decentralized-convex-server` — PDS installation, root dispatch,
  Component dispatch, and discovery descriptors
- `packages/decentralized-convex-client` — discovery, connections, typed calls,
  federation, and subscriptions
- `packages/decentralized-convex-react` — client provider
- `packages/decentralized-convex-tanstack-query` — reactive query hooks
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
