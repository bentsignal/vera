# `@decentralized-convex/server`

Server helpers for installing and dispatching decentralized-convex plugins.

## Install a PDS

```ts
import accounts from "@decentralized-convex/accounts/convex.config";
import messages from "@decentralized-convex/messages/convex.config";
import { definePdsApp } from "@decentralized-convex/server";

export default definePdsApp({
  components: [betterAuth],
  plugins: [accounts, messages],
});
```

Each plugin's default Component export carries its protocol in the TypeScript
type. `definePdsApp` checks the complete tuple for missing, incompatible, or
duplicate plugins without requiring a second protocol import. `components`
accepts normal Convex Components or `{ component, options }` entries for custom
install names and HTTP prefixes. `app: { httpPrefix }` configures the root app.

Plugin packages apply that type internally while preserving Convex's required
single default export:

```ts
export default definePdsPluginComponent(
  defineComponent(messagesProtocol.name),
  messagesProtocol,
);
```

## Expose the data plane

```ts
export const { dispatchMutation, dispatchQuery } = definePdsRouter({
  components,
  mutation,
  query,
});
```

This is the stable `pds:dispatchMutation` / `pds:dispatchQuery` pair. The router
authenticates once, selects the installed plugin, and crosses one Component
boundary. `defineComponentDispatchers` performs exact operation validation and
invokes the plugin handler.

`pdsDescriptorFromApp(app, host)` derives the ecosystem release and installed
plugin `lastChanged` metadata from the same app declaration. This is the PDS
management boundary that future Component migration controls will extend.
