# `@decentralized-convex/messages`

First-party authenticated Messages protocol and Convex Component.

The protocol explicitly requires `accounts@1`, so a host cannot install
Messages without a compatible Accounts plugin. Messages receives canonical
identity from the root PDS router and keeps its hot read/write path inside one
Component boundary.

```ts
import messages from "@decentralized-convex/messages/convex.config";
```

The default export is a normal Convex Component whose TypeScript type also
carries the Messages protocol and its `accounts@1` requirement.
