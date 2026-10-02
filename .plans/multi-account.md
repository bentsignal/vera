# Multi-account (email-style)

Shawn's request: be signed into several accounts at once, like an email app.
Inboxes and spaces combine, you can filter to one account, and replies always
go out from the account the conversation belongs to.

## Design

- **Sessions in one cache.** `@decentralized-convex/tanstack-query` gained a
  `session` option. Each signed-in account has its own `PdsQueryClient`
  (`new PdsQueryClient(client, { session: address })`) connected to the app's
  single `QueryClient`. `pdsQuery`/`pdsMutation` take `session` and cache under
  `pdsSessionQueryKey(session)`. Unscoped usage is unchanged.
- **Stored accounts.** `features/session/account-store.ts` persists
  `{ address, domain, storagePrefix }[]` plus the account filter in
  SecureStore. Each account's Better Auth cookies live under its own
  `storagePrefix`. The pre-multi-account session (prefix `vera-<domain>`) is
  adopted as the first account on upgrade, so nobody is signed out.
- **Signing in another account.** Every sign-in (first or additional) runs
  through a pending auth client (`vera-pending`). On success its cookie and
  cached session are copied to a fresh prefix and the account is added. If
  the account is already signed in, the duplicate session is signed out.
- **Acting account.** `AccountScope` provides the account a screen acts as.
  Conversation, space, channel, add-people, and media routes take an
  `account` param; `useAccount()` returns the scoped account, or the first
  account outside any scope. Messaging hooks pass `session: address`.
- **Combined views.** Chats, Spaces, and Search query every visible account
  (the filter narrows them) and tag each row with its account. Rows show the
  account when more than one is visible.
- **Compose.** New Message and New Space show a "From" picker when several
  accounts are signed in.
- **Push.** Tokens are stored per (account, device), so one device gets every
  account's notifications. Push data includes `accountId`; tapping opens the
  conversation as that account.
- **Settings.** An Accounts section lists each account (tap for its profile,
  photo, name, and sign-out) plus Add Account.

## Limits

- Adding an account only signs into this build's home domain. Other PDSs
  would need their own passkey relying party, which Vera's app isn't
  associated with.
