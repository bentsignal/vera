# Vera backend

This is the thin PDS host used by Vera. Its complete plugin installation is the
single declaration in `convex/convex.config.ts`:

```ts
export default definePdsApp({
  auth: pdsAuth,
  plugins: [accounts, messages],
});
```

`pdsAuth` is the shared Better Auth adapter declaration. It installs the
Better Auth Component, supplies the federation plugin to Vera's otherwise
normal `betterAuth({...})` configuration, and contributes public auth metadata
to PDS discovery without repeating it in the HTTP router.

Messages explicitly requires Accounts. The app definition fails type-checking
if that dependency is absent or incompatible. No custom development or deploy
command is required; this is a normal Convex app definition.

The browser-facing API is derived from that same app declaration:

```ts
import { definePdsApi } from "@decentralized-convex/client";
import { protocolsFromPdsApp } from "@decentralized-convex/server";

import app from "./convex/convex.config";

export const protocols = protocolsFromPdsApp(app);
export const pds = definePdsApi(...protocols);
```

Applications consume it through `@vera/backend/pds`; adding or removing a
plugin changes the client API without editing this stable module. The public
discovery manifest derives its capability list from this same `protocols`
tuple, so it cannot drift from the installed app.

The root exposes Better Auth plus one generic PDS query and mutation. Message
schema and behavior live entirely in `@decentralized-convex/messages`; account
profiles live in `@decentralized-convex/accounts`.

Better Auth is Vera's current authentication choice through
`@decentralized-convex/auth-better-auth`; other hosts can supply adapters for
their own auth system. Convex requires Component imports to be written directly
in `convex.config.ts`, so the Better Auth Component is installed there through
`components` rather than through the adapter.

## Accounts and sign-in

Passkeys are the only credential. Sign-up sends the invite code and username as
the passkey registration `context`; the server checks both when issuing
registration options, checks again after the passkey is verified, then redeems
the invite, creates the account, and starts a session. Invite codes are managed
with the operator functions in `convex/invites.ts` (see the `invite-codes`
agent skill).

Usernames that look official are reserved: `DEFAULT_RESERVED_USERNAMES` from
`@decentralized-convex/address` (`admin`, `help`, `support`, `security`, and
so on) plus Vera's own (`vera`, `vera_support`, ...) in `convex/auth.ts`. The
check ignores case, dots, dashes, underscores, and trailing digits, so
`Help_Desk2` is reserved too, and a reserved name fails with
`USERNAME_TAKEN`. To create one of these accounts yourself, make an invite
code for that username and sign up with it:

```sh
npx convex run invites:create '{"label":"support account","username":"support"}'
```

A code with a `username` signs up only that username.

Accounts that speak for Vera, such as `support@vera.chat`, can be marked
affiliated. The app then shows a verified check next to their names, and
tapping it explains that the account is an official account of the domain.
Only accounts on this deployment's `FEDERATION_DOMAIN` can be affiliated.

```sh
npx convex run affiliations:add '{"address":"support@vera.chat"}'
npx convex run affiliations:remove '{"address":"support@vera.chat"}'
npx convex run affiliations:list
```

## Support account

`support@<account domain>` is a verified account that DMs every new account
a welcome asking for bug reports (a Better Auth `user.create` hook schedules
`support:welcome`). It creates itself the first time it's needed, so every
deployment has one without setup. It has no passkey: operators and their
agents read and answer its inbox with the commands in `convex/support.ts`
(`support:inbox`, `support:read`, `support:send`, `support:markRead`). Nothing
replies automatically. See the `support-inbox` agent skill.

## Deployments

Both deployments live in the Convex project `vera` (team BSX).

- Production backs TestFlight and store builds. Account domain `vera.chat`.
- `perceptive-magpie-29` is the shared development deployment. Account domain
  `dev.vera.chat`.

```sh
pnpm --filter @vera/backend dev      # push to the development deployment
pnpm --filter @vera/backend deploy   # deploy to production
```

Environment variables on each deployment:

| Name                          | Example                              | Purpose                                       |
| ----------------------------- | ------------------------------------ | --------------------------------------------- |
| `FEDERATION_DOMAIN`           | `vera.chat`                          | Domain in every account address               |
| `PASSKEY_RP_ID`               | `vera.chat`                          | WebAuthn relying party ID (permanent)         |
| `PASSKEY_ORIGINS`             | `https://vera.chat`                  | Comma-separated accepted WebAuthn origins     |
| `BETTER_AUTH_SECRET`          | random                               | Better Auth signing secret                    |
| `PASSKEY_APPLE_APP_IDS`       | `39K6A9FP99.chat.vera.app`           | Apps listed in the Apple app site association |
| `PASSKEY_ANDROID_PACKAGE`     | `chat.vera.app`                      | Android app listed in `assetlinks.json`       |
| `PASSKEY_ANDROID_CERT_SHA256` | `AB:CD:...`                          | Comma-separated Android signing fingerprints  |
| `BUNNY_S3_ENDPOINT`           | `https://ny-s3.storage.bunnycdn.com` | bunny.net Storage S3 endpoint                 |
| `BUNNY_S3_REGION`             | `ny`                                 | Region used to sign uploads                   |
| `BUNNY_STORAGE_ZONE`          | `vera-media`                         | Storage zone (also the S3 access key)         |
| `BUNNY_S3_SECRET`             | secret                               | Storage zone password                         |
| `BUNNY_CDN_URL`               | `https://media.vera.chat`            | Public base URL for media                     |
| `BUNNY_PATH_PREFIX`           | `prod`                               | Folder for this deployment's uploads          |

## Passkey domain

Passkeys use the relying party `vera.chat`, and iOS and Android require that
domain to list the app. The production deployment serves
`/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json`
from `convex/appAssociation.ts`. `vera.chat` reaches them through a small
Vercel proxy (`infra/vera-chat-domain`), because Convex custom domains need a
CNAME, which a bare domain cannot have.

## Public discovery

An account domain needs exactly one DNS record. Publish a TXT record at
`_pds.<account-domain>` with this value:

```text
v=pds1;url=https://<deployment>.convex.site/.well-known/decentralized-convex
```

The manifest returns the PDS's current Convex realtime URL, HTTP/auth URL,
public signing keys, and installed protocol versions. The `convex.cloud` and
`convex.site` hostnames are transport details; account identities remain
`username@<account-domain>`. This setup is identical on free and Pro Convex
plans. A host may use Convex custom domains internally, but Vera does not
require or infer `api.` or `pds.` subdomains.
