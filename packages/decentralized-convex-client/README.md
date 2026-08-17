# `@decentralized-convex/client`

Framework-independent discovery, connection, and federation client.

```ts
const pds = definePdsApi(accountsProtocol, messagesProtocol);
const client = new DecentralizedConvexClient({ pds: { home } });

await client.pdsMutation(pds.messages.send(input));
const messages = await client.pdsQuery(pds.messages.list({ conversationId }));
```

`definePdsApi` uses each protocol's own name. Query and mutation builders are
available directly on each plugin; the nested namespaces remain available to
the lower-level binding API. `DecentralizedConvexClient` lazily reuses one
Convex connection per normalized deployment URL. A PDS query starts at the
configured home, reads routing identities returned by the plugin, discovers
their current deployments, and reconciles every source. Mutations default to
the configured home. The lower-level `federatedPdsQuery` and
`federatedPdsMutation` methods remain available for explicitly targeted tools.

The default function references are `pds:dispatchQuery` and
`pds:dispatchMutation`. Advanced consumers may construct `PdsClient` with
different references or a custom connection.
