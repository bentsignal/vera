# `@decentralized-convex/plugin`

Defines the contract shared by plugin authors, PDS hosts, and clients.

```ts
// metadata.ts
export const decentralizedConvexPackage = defineDecentralizedConvexPackage({
  name: "@decentralized-convex/messages",
  lastChanged: "0.1.0",
});

// protocol.ts
export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
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

`definePluginProtocol` injects the one decentralized Convex ecosystem version;
plugins cannot select independent versions. `lastChanged` comes from the
standardized metadata owned by this package and changes only when this package
actually changes. Every package exposes that object as
`@decentralized-convex/<name>/metadata`; core does not maintain a package
registry.

`requires` maps plugin names to the ecosystem version. A complete protocol
set rejects missing dependencies, incompatible versions, duplicate names, and
cycles both statically and at runtime:

```ts
defineProtocolSet(accountsProtocol, messagesProtocol);
```

The same operation definitions generate discriminated request/response
validators and preserve operation-specific argument and result types through
the intentionally generic PDS dispatcher.

Every official package is released in lockstep. See
[`docs/versioning.md`](../../docs/versioning.md) for compatibility and upgrade
rules.
