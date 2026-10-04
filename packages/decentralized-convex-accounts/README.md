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

## Affiliated accounts

A PDS can vouch that some of its own accounts speak for it, such as its
support account. Profiles carry `affiliated: true` for those accounts, and
apps show a verified check next to their names. Only the host sets it, through
the Component's `affiliations.setAffiliated` mutation (never callable by
clients); the host must accept only addresses on its own domain. Apps should
describe the check as an affiliation with the account's domain, which is all
the PDS can vouch for.
