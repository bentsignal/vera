# Decentralized Convex architecture

## One concept from package to wire

A plugin protocol is the source of truth for four things:

```ts
export const messagesProtocol = definePluginProtocol({
  name: "messages",
  version: "1",
  requires: { accounts: "1" },
  queries: { list: defineOperation(/* validators */) },
  mutations: { send: defineOperation(/* validators */) },
});
```

- `name` is the Convex Component install name and wire plugin discriminator.
- `version` is checked by the client, root router, Component, and manifest.
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

The host calls `definePdsApp({ plugins, components })`. It:

1. checks duplicate names, missing plugins, and incompatible exact versions
   through the plugin tuple's TypeScript type;
2. installs each plugin as a normal Convex Component;
3. installs unrelated Components such as Better Auth without treating them as
   PDS protocols.

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
usePdsQuery
  -> DecentralizedConvexClient connection for each target
  -> pds:dispatchQuery on each deployment
  -> root authentication and plugin selection
  -> messages.dispatcher.dispatchQuery
  -> exact operation/version/argument validation
  -> list handler and Component database
  -> per-source results merged in the client
```

A write follows the same path through `pds:dispatchMutation`, targeting only the
author's home PDS. The root router resolves identity once and passes the small
identity value across one Component boundary.

## Package boundaries

`@decentralized-convex/plugin` knows about contracts, not React, authentication,
Vera, or deployment routing.

`@decentralized-convex/server` knows how to install and dispatch protocols, but
not Vera's messaging policy or Better Auth.

`@decentralized-convex/client` knows deployments, connections, authentication
token callbacks, subscriptions, and typed protocol requests. React and
TanStack Query integrations remain optional packages.

Accounts and Messages own their schemas and operation implementations. Vera's
backend supplies authentication and federation credential exchange. Vera's web
app supplies product-specific conversation selection and presentation.

## Defaults and extension points

The default path intentionally needs only:

- `definePdsApp` on the server;
- one stable backend `pds` export inferred from that app definition;
- `usePdsQuery({ request, targets })` for reactive reads;
- `client.pdsMutation(target, request)` for writes.

Applications may override:

- ordinary Component install names and HTTP prefixes;
- the root app HTTP prefix;
- connection creation and destination-aware token fetching;
- target-specific requests;
- result combination and deduplication;
- TanStack query keys and enablement;
- the canonical root query and mutation references through `PdsClient`.

## Proven and not yet proven

The two deployed Vera development PDSs have proven address discovery,
destination-bound authentication, private reads and writes, reactive remote
updates, root dispatch, exact Component validation, and author-home storage.

Still prototype-only:

- the web app uses one explicit two-domain conversation fixture;
- conversation membership and routing are not discovered from product data;
- the UI holds one active account rather than concurrent accounts;
- auth lacks scopes, revocation, replay limits, and resource-specific policy;
- plugin version ranges, migrations, upgrades, and large plugin graphs need a
  production design;
- packages are private workspace packages and self-hosting is not productized.
