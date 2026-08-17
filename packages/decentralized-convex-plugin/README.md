# `@decentralized-convex/plugin`

Defines the contract shared by plugin authors, PDS hosts, and clients.

```ts
export const messagesProtocol = definePluginProtocol({
  name: "messages",
  version: "1",
  requires: { accounts: "1" },
  queries: {
    list: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.array(message),
    }),
  },
  mutations: {
    send: defineOperation({
      args: v.object({
        body: v.string(),
        conversationId: v.string(),
        messageId: v.string(),
      }),
      returns: message,
    }),
  },
});
```

`requires` maps plugin names to exact protocol versions. A complete protocol
set rejects missing dependencies, incompatible versions, duplicate names, and
cycles both statically and at runtime:

```ts
defineProtocolSet(accountsProtocol, messagesProtocol);
```

The same operation definitions generate discriminated request/response
validators and preserve operation-specific argument and result types through
the intentionally generic PDS dispatcher.

Version ranges, optional dependencies, and migration policy are deliberately
not hidden behind premature abstractions. Version `1` currently means exact
compatibility.
