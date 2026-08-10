# `@decentralized-convex/plugin`

Shared plugin composition and operation protocols for decentralized Convex
applications.

Plugins provide versioned capability contracts and may require contracts from
other plugins. The final composition boundary reports missing or incompatible
providers at type-check time and validates the complete dependency graph before
running plugin setup.

```ts
interface AccountsService {
  getAccount(address: string): { address: string; displayName: string };
}

const Accounts = defineCapability<AccountsService>()({
  id: "org.decentralized-convex.accounts",
  version: "1",
});

const accountsPlugin = definePlugin({
  name: "accounts",
  provides: [Accounts],
  requires: [],
  setup: () => [accountsService],
});

const messagesPlugin = definePlugin({
  name: "messages",
  provides: [Messaging],
  requires: [Accounts],
  setup: ({ get }) => {
    const accounts = get(Accounts);
    return [createMessagingService(accounts)];
  },
});

const app = composePlugins(messagesPlugin, accountsPlugin);
const messaging = app.get(Messaging);
```

Plugin order does not matter. Dependencies determine setup order. Omitting the
accounts provider produces a TypeScript error at `composePlugins`.

A product profile is another dependent capability rather than a mutation of the
accounts contract. For example, a `VeraProfiles` plugin can require `Accounts`,
inherit the account display name and avatar, and provide Vera-specific overrides.
Ruby or Sync can install separate profile capabilities over the same account.

## Component operation protocols

A Component can define all of its client-facing behavior as typed operations.
Each operation owns its argument and return validators, and a plugin protocol
groups them into query and mutation maps:

```ts
const messages = definePluginProtocol({
  name: "messages",
  version: "1",
  queries: {
    listMessages: defineOperation({
      args: v.object({ conversationId: v.string() }),
      returns: v.array(message),
    }),
  },
  mutations: {
    sendMessage: defineOperation({
      args: message,
      returns: message,
    }),
  },
});
```

`defineComponentDispatchers` from `@decentralized-convex/server` turns those
maps into one real Convex query and one real mutation. `definePdsRouter` exposes
one root query and mutation for every installed Component. The client SDK uses
the same protocol to restore operation-specific argument and return types even
though the root Convex functions are intentionally generic.

The Component uses its protocol name as its Convex name:

```ts
export default defineComponent(messages.name);
```

Installing it into a PDS is one line:

```ts
app.use(messagesComponent);
```

The shared root router resolves that install name dynamically, so installing a
plugin does not require adding wrapper functions or a second router registry.

Once bound, client calls stay small and contain only application arguments:

```ts
const client = new PdsClient({ connection });
const pds = client.bind(definePdsApi({ messages }));

const result = await pds.messages.query.listMessages({ conversationId });
await pds.messages.mutation.sendMessage(message);
```
