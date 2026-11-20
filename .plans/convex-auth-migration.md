# Move from Better Auth to Convex Auth 2.0

Status: **waiting.** It starts after the data pass (PR #267) ships
(decided with Shawn, 2026-11-19). Analysis from 2026-11-13.

## Why

Convex Auth 2.0 (`@convex-dev/auth@2.0.0`, released 2026-11-12) is built
from Convex components and fits Vera better than Better Auth does:

- **Sign-up is one transaction.** Creating the account, username, and
  passkey and scheduling Vera's welcome all happen in one mutation. Today
  Better Auth runs over HTTP, and its adapter makes a database call for
  each step.
- **Fewer workarounds.** These go away: the local copy of the Better Auth
  component that adds the passkey table, the JWKS date fix in
  `federation-plugin.ts` (#2c302a0e), `jwksRotateOnTokenGenerationError`,
  the `jwks` table, and the `@better-auth/expo` cookie plumbing.
- **The deployment owns the signing key.** `ctx.auth.signJwt` (Convex
  1.48+) signs ES256 tokens with a key derived from the deployment secret.
  The public keys are at `${CONVEX_CLOUD_URL}/.well-known/jwks.json`. The
  open-source backend serves them too (`crates/local_backend/src/deployment_jwks.rs`),
  so self-hosting keeps working.
- **New features at no cost.** Per-device sessions (sign out one device,
  or everywhere but here), and listing, renaming, and revoking passkeys.
- **Less backend code.** Measured with esbuild, minified:

  | | Better Auth | Convex Auth |
  |---|---|---|
  | Phone client | 42 KB (15 KB gz) | 14–18 KB (5–6 KB gz) |
  | Backend auth code | 1.27 MB (330 KB gz) | ~300 KB (~95 KB gz) |

  The phone saves about 10 KB gzipped, which doesn't matter. The backend
  saving matters, because Convex loads a function's whole import graph on
  every call (see below).

Now is the cheapest time: TestFlight users only, one PDS, nobody federating
with us yet.

## Fit

- Passkeys on React Native: `methods/username-passkey/react-custom` takes
  our own ceremonies, so `react-native-passkey` stays. No native change.
- Token storage: the `AuthClient` (`@convex-dev/auth/browser`) takes any
  `TokenStorage` and a `storageNamespace`, which maps onto the SecureStore
  prefixes that multi-account uses.
- Sign-up rules: `attachUserCallbacks({ createUser })` is an internal
  mutation. The address format and reserved names go there, and so does
  the welcome.
- Vera's data is keyed on account addresses, not auth user IDs, so the
  messages and accounts data aren't rewritten.
- Auth sits behind `PdsAuthAdapter`. The swap is a new adapter package
  in place of `@decentralized-convex/auth-better-auth`.

## Token handling to keep (from the data pass, PR #267)

The data pass reworks the app's token fetcher while still on Better Auth.
The migration keeps all of it and only swaps what fetches the token:

1. **The home token lasts 1 hour** instead of Better Auth's default 15
   minutes. That's Convex Auth's default too, so keep it.
   (Measured: opening a chat from a notification spent about 400 ms getting
   a new token before any query ran, because the 15-minute token had almost
   always expired.)
2. **It's refreshed as the app wakes**, if it has expired or is about to,
   while reconnecting. It doesn't wait for the server to reject the old one.
3. **There's one shared token request per account.** At launch, several
   parts of the app fetched one at the same moment: three parallel
   `/api/auth/*` requests, 850 ms each on a cold backend.
4. **A failed token request is retried, not turned into "no token".**
   Convex's client reads null as signed out. It asks once more, then gives
   up for good, and the app sits at "Retrying…" (#343). Details are in the
   observability thread's `.plans/observability.md`.

All four live in the token fetcher: `apps/mobile/src/features/session/federation-auth.ts`,
`account-session.ts`, and the `getAuthToken` given to
`DecentralizedConvexClient`. That interface doesn't change under Convex Auth.

## Keep auth out of the hot import graph

Convex loads a function's whole import graph on every call. Keep auth
libraries out of anything the PDS router (`services/backend/convex/pds.ts`)
or the plugin dispatchers import. `services/backend/function-bundles.test.ts`
enforces a size budget. AGENTS.md and the "Function bundles" section of
docs/architecture.md explain it (both arrive with PR #267).

## Risks

1. **Moving existing passkeys is the critical step.** Passkeys are the only
   way to sign in, so a passkey that doesn't move over is a locked-out
   account. The passkey component has no import function. Its `passkeys`
   table is simple (`credentialId`, `publicKey` as bytes, `counter`,
   `transports`, `userId`), so converting Better Auth's `passkey` rows and
   importing them into the component should work. Prove it before anything else.
2. **One-tap sign-in with no username.** The built-in flow asks for a
   username first. The server accepts an unbound challenge (the one used
   for autofill), and a discoverable credential then names the user. This
   should work with a regular passkey prompt, but it isn't proven yet.
3. **Everyone signs in once more.** Better Auth sessions don't carry over.
   With migrated passkeys that's one tap.
4. **Federation assertions move to `ctx.auth.signJwt`.** It runs only in
   mutations, uses ES256, allows at most 1 hour, and sets `iss` itself. The
   issuer changes to `CONVEX_CLOUD_URL`. That's fine while Vera's PDS is
   the only one. Claims starting with `convex` or `cvx` are reserved.
5. **It's a breaking backend change.** It ships with `--with-backend`.
   Convex goes from 1.46 to at least 1.48 (1.49 drops Node 20).
6. **2.0.0 is new.** It was in beta from 2026-10-15.

## Plan

1. Prototype in a worktree, after #267 ships:
   - one-tap sign-in with no username on iOS and Android, through
     `react-custom` ceremonies on `react-native-passkey`
   - copy a real Better Auth passkey into the passkey component and sign
     in with it
2. If both work, build the migration: the backend auth setup and dev
   sign-in, a Convex Auth PDS adapter package, the phone session files
   (keeping the token handling above), and a one-off script that copies
   users, usernames, and passkeys. Extra release steps go in
   docs/next-release.md.
3. Remove Better Auth and its component once production has moved.
