# `@decentralized-convex/accounts`

First-party Accounts protocol and Convex Component. It owns canonical account
profiles and has no PDS plugin dependencies.

Install the default Component with:

```ts
import accounts from "@decentralized-convex/accounts/convex.config";
```

The default export is a normal Convex Component whose TypeScript type also
carries the Accounts protocol and dependency metadata.

The host supplies authenticated `accountId` identity through the generic PDS
router; Accounts does not choose or depend on an authentication provider.
