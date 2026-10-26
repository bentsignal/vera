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

## Profiles on other servers

A PDS keeps only its own accounts' profiles. Asked by `getProfile` for one it
doesn't have, it answers `null` and routes the query to that account's home
PDS, as Messages routes a conversation's members, so a client asking through
any account still gets the profile.

## Affiliated accounts

A PDS can vouch that some of its own accounts speak for it, such as its
support account. Profiles carry `affiliated: true` for those accounts, and
apps show a verified check next to their names. Only the host sets it, through
the Component's `affiliations.setAffiliated` mutation (never callable by
clients); the host must accept only addresses on its own domain. Apps should
describe the check as an affiliation with the account's domain, which is all
the PDS can vouch for.

A host retiring one of its own accounts deletes its profile and
affiliation with `affiliations.removeAccount`, also host-only.

## Safe profile updates

Profiles belong to their account's home PDS. `getMyProfile` requires an
authenticated identity. A missing identity throws rather than returning
`null`, so a client reconnecting cannot mistake lost authentication for a
missing profile. `null` means the authenticated account has no profile.

`upsertMyProfile` changes only supplied fields. Omit `avatarUrl` to keep the
photo, or pass `null` to remove it. Omit `displayName` to keep the name.
A first write without a name uses the account's username. Older clients can
still supply both fields.

Automatic initialization passes `createOnly: true`. The existence check and
write run in one mutation. If the profile already exists, the mutation
returns it without changing anything. Do not initialize with an ordinary
upsert after a client-side read: the read can be stale by the time the write
arrives, including when another device has just changed the profile.

Vera's editor saves name and photo edits separately. Upload completion and
name debounce callbacks can run after another edit, so neither sends the
other field's earlier value. Regression tests cover these overwrite paths
for [#289](https://github.com/bentsignal/vera/issues/289).
