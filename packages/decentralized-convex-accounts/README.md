# `@decentralized-convex/accounts`

The product-agnostic account profile Component for a decentralized Convex PDS.
The authenticated identity comes from the host PDS; this package stores only
the shared account profile that other products can build on.

```ts
import accounts from "@decentralized-convex/accounts/convex.config";

app.use(accounts);
```
