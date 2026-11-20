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

  |                   | Better Auth         | Convex Auth          |
  | ----------------- | ------------------- | -------------------- |
  | Phone client      | 42 KB (15 KB gz)    | 14–18 KB (5–6 KB gz) |
  | Backend auth code | 1.27 MB (330 KB gz) | ~300 KB (~95 KB gz)  |

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

1. **The home token lasts 24 hours**, not Better Auth's default 15
   minutes, and the app renews it ahead of time. With under 12 hours left
   it renews every 15 minutes while the app is open, on coming to the
   front, and on leaving (`keepTokenFresh` in `account-session.ts`). So a
   wake rarely waits on a token request.
   (Measured: opening a chat from a notification spent about 400 ms getting
   a new token before any query ran, because the 15-minute token had almost
   always expired.) **This conflicts with Convex Auth:** `ctx.auth.signJwt`
   allows at most 1 hour, so its access tokens can't last 24 hours. After
   any sleep over an hour, the wake waits for one refresh mutation. Measure
   that mutation, warm and cold, against what Better Auth costs today:
   signing a token cold took ~650 ms after an idle night, mostly cold reads
   of the Better Auth component. Keep the refresh in parallel with the
   reconnect. If the wait is still noticeable, ask Shawn before going
   further (a longer-lived token signed some other way, say).
2. **It's refreshed as the app wakes**, if it has expired or is about to,
   while reconnecting. It doesn't wait for the server to reject the old one.
3. **There's one shared token request per account.** At launch, several
   parts of the app fetched one at the same moment: three parallel
   `/api/auth/*` requests, 850 ms each on a cold backend.
4. **A failed token request is retried, not turned into "no token".**
   Convex's client reads null as signed out. It asks once more, then gives
   up for good, and the app sits at "Retrying…" (#343). Details are in the
   observability thread's `.plans/observability.md`.

All of these live in the token fetcher: `apps/mobile/src/features/session/federation-auth.ts`,
`account-session.ts`, and the `getAuthToken` given to
`DecentralizedConvexClient`. That interface doesn't change under Convex Auth.

## Checking a token takes no HTTP fetch (from the data pass, 2026-11-20)

Measured on Shawn's phone against an isolated backend. Today
`auth.config.ts` uses the OIDC form (`domain: CONVEX_SITE_URL`), so after
every reconnect from sleep, Convex fetches the deployment's own
`/.well-known/openid-configuration` and then `/api/auth/convex/jwks` before
it accepts the token. That's about 130–270 ms per wake. The data pass didn't
fix it. Better Auth's static keys (`getAuthConfigProvider({ jwks })`,
`convex({ jwks })`) work only with RS256, and Vera's single EdDSA key also
signs the federation assertions that remote PDSs verify through
`/api/auth/convex/jwks`.

Convex Auth's `convexAuthProvider()` **does not fix this by itself**. It's
a `customJwt` provider whose `jwks` is a URL
(`${CONVEX_CLOUD_URL}/.well-known/jwks.json`). In the open-source backend,
`crates/authentication/src/lib.rs` (`fetch_jwks`) fetches that URL on each
check. Only a `data:` URI is read without a fetch. The cloud may cache it,
but nothing shows that. So the migration must:

- inline the deployment's JWKS as a data URI in `auth.config.ts`. Read it
  from `/.well-known/jwks.json` at deploy time, and redo that when the key
  generation changes, or the checks fail. Or show by measuring that Convex
  caches the URL fetch. Then check the logs on a phone: a wake should make
  no JWKS or discovery request.
- keep federation keys separate from session-token keys. Under Convex
  Auth, the deployment's `/.well-known/jwks.json` keeps serving every
  key generation no matter what `auth.config.ts` inlines. Federation
  assertions use that URL in the discovery descriptor, so inlining the
  session keys can't break cross-PDS checks. Their audiences differ
  (`convex-auth` against the remote PDS's domain), so a token can't be
  passed off as the other kind. If federation ever needs its own key,
  give it its own JWKS URL in the descriptor.

## Better Auth re-checks sessions on every reconnect (from the data pass)

The data pass turned off `refetchOnWindowFocus` in `createHomeAuthClient`.
The Better Auth client still refetches `get-session` whenever the network
comes back, for every account client, through a shared broadcast channel.
It has no option to stop that: about 6 requests per wake on a three-account
phone, and nothing in the app needs them. Shawn is fine leaving it until
the migration. The Convex Auth `AuthClient` shouldn't do this. Check that
it doesn't call the server on reconnect unless a token needs renewing.

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
   mutations, uses ES256, allows at most 1 hour (which also caps the home
   token, see above), and sets `iss` itself. The
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
   - measure a wake after more than an hour asleep: the refresh mutation
     (warm and cold), and that checking the token makes no JWKS fetch
2. If both work, build the migration: the backend auth setup and dev
   sign-in, a Convex Auth PDS adapter package, the phone session files
   (keeping the token handling above), and a one-off script that copies
   users, usernames, and passkeys. Extra release steps go in
   docs/next-release.md.
3. Remove Better Auth and its component once production has moved.
