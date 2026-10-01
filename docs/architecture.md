# Decentralized Convex architecture

## One concept from package to wire

A package owns its release metadata, and its plugin protocol consumes that
local export:

```ts
export const decentralizedConvexPackage =
  defineDecentralizedConvexPackage({
    name: "@decentralized-convex/messages",
    lastChanged: "0.1.0",
  });

export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
  queries: { list: defineOperation(/* validators */) },
  mutations: { send: defineOperation(/* validators */) },
});
```

- `name` is the Convex Component install name and wire plugin discriminator.
- the ecosystem `version` is injected from one release source of truth;
- `lastChanged` comes from the package that owns the plugin and records when
  that package actually changed;
- `requires` is validated against the complete deployment at type-check and
  Convex config evaluation time.
- operation validators produce client argument/result types and enforce the
  same contract inside the Component.

There is no separate in-memory plugin model or manually maintained router
registry.

## Server setup

Each plugin exports a normal Convex Component whose TypeScript type carries its
protocol. The host imports that single value through the `convex.config` path
required by Convex and never manually pairs a Component with its protocol.

The host calls `definePdsApp({ auth, plugins, components })`. It:

1. checks duplicate names, missing plugins, and incompatible ecosystem versions
   through the plugin tuple's TypeScript type;
2. installs each plugin as a normal Convex Component;
3. installs an optional auth adapter's Component and derives its public
   descriptor metadata from that same adapter;
4. installs unrelated Components without treating them as PDS protocols.

The protocol marker is deliberately type-only. Convex replaces imported
Component definitions while evaluating `convex.config.ts`, so runtime metadata
attached to the original object would be lost. This design keeps the standard
Convex commands and bundling behavior intact.

Outside Convex's config evaluator, the plugin packages also register their
protocol objects in a private local map. The backend's stable `pds` module reads
that map from the same app declaration to build the browser API and discovery
capability list. No second plugin registry is maintained.

Convex code generation then discovers the public exports in
`services/backend/convex/pds.ts`. The web client addresses them by their stable
wire names, `pds:dispatchQuery` and `pds:dispatchMutation`, so it does not need
the generated API of any particular independently hosted backend.

## Request path

A Messages read follows this path:

```text
useQuery(pdsQuery({ query, args, options }))
  -> pds:dispatchQuery on the signed-in account's home
  -> typed data plus hidden conversation routing identities
  -> current PDS discovery for those identities
  -> pds:dispatchQuery on each discovered deployment
  -> root authentication and plugin selection
  -> messages.dispatcher.dispatchQuery
  -> exact operation/last-changed/argument validation
  -> list handler and Component database
  -> per-source results merged into the application's TanStack cache
```

A write follows the same path through `pds:dispatchMutation`, targeting only the
author's home PDS. The root router resolves identity once and passes the small
identity value across one Component boundary.

## Package boundaries

`@decentralized-convex/plugin` knows about contracts, not React, authentication,
Vera, or deployment routing.

`@decentralized-convex/server` knows how to install and dispatch protocols and
the generic shape of a PDS auth adapter, but not Vera's messaging policy or any
specific auth vendor.

`@decentralized-convex/auth-better-auth` bridges a normally configured Better
Auth instance to the public PDS federation-auth endpoints. Better Auth remains
a peer dependency, and its database, providers, sessions, callbacks, and UI
remain entirely under the host's control. The config-time adapter is separated
from its server-only runtime bridge so importing the generated PDS API does not
bundle Better Auth into clients.

`@decentralized-convex/client` knows deployments, connections, authentication
token callbacks, subscriptions, and typed protocol requests. React and
TanStack Query integrations remain optional packages.

Accounts and Messages own their schemas and operation implementations. Vera's
backend supplies its normal Better Auth configuration to the adapter. Vera's
web app supplies product-specific conversation selection and presentation.

## Defaults and extension points

The default path intentionally needs only:

- `definePdsApp` on the server;
- one stable backend `pds` export inferred from that app definition;
- the application's native `useQuery(pdsQuery({ query, args, options }))` for
  reactive reads and federation diagnostics in `data`;
- the application's native `useMutation(pdsMutation({ mutation, options }))`
  for writes.

PDS query `data` is a discriminated `loading`, `partial`, `success`, or `error`
object. Partial and successful states carry the operation value as `result`;
loading is never represented by an ambiguous `undefined` value. Every state
also carries federation status and per-source diagnostics.

Initial partial data remains loading for `500ms` by default and can be tuned
with `options.revealPartialResultsAfter`. Complete data bypasses the delay. Once
every initial PDS has responded, the query remains successful: temporary
disconnects retain last-known source data, and newly discovered PDSs load in
the background instead of resetting the visible result.

Applications may override:

- ordinary Component install names and HTTP prefixes;
- the root app HTTP prefix;
- connection creation and destination-aware token fetching;
- explicit lower-level federation targets;
- result combination and deduplication;
- TanStack query keys and enablement;
- the canonical root query and mutation references through `PdsClient`.

## Proven and not yet proven

The two deployed Vera development PDSs have proven address discovery,
destination-bound authentication, private reads and writes, reactive remote
updates, root dispatch, exact Component validation, and author-home storage.

Still prototype-only:

- the web app uses one explicit two-domain conversation fixture, but its
  routing is stored on each account's home and discovered through product data;
- the UI holds one active account rather than concurrent accounts;
- the Better Auth adapter covers the existing home-to-remote assertion
  exchange, while universal client-to-home sign-in is the next auth slice;
- auth lacks scopes, revocation, replay limits, and resource-specific policy;
- Component migration execution, persisted upgrade state, and large plugin
  graphs still need a production design;
- packages are private workspace packages and self-hosting is not productized.
