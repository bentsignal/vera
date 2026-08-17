# `@decentralized-convex/client`

Framework-independent discovery, connection, and federation client.

```ts
const pds = definePdsApi(accountsProtocol, messagesProtocol);

await client.pdsMutation(
  { id: accountId, url: homeUrl },
  pds.messages.send(input),
);
```

`definePdsApi` uses each protocol's own name. Query and mutation builders are
available directly on each plugin; the nested namespaces remain available to
the lower-level binding API. `DecentralizedConvexClient` lazily reuses one
Convex connection per normalized deployment URL, groups duplicate targets,
supports point queries and realtime observers, and reports every source
independently.

The default function references are `pds:dispatchQuery` and
`pds:dispatchMutation`. Advanced consumers may construct `PdsClient` with
different references or a custom connection.
