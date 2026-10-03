# Mobile launch decisions

Decided with Shawn on 2026-10-01. Goal: a working app on Shawn's phone within
1–2 days, friends messaging on it within a week.

## Product scope for the first release

- Mobile first. The web app is removed for now and rebuilt later on `shared/ui`.
- Accounts are addresses: `username@vera.chat`.
- One-on-one DMs, an inbox, group chats.
- Minimal spaces: a named collection of text channels. No roles, threads, or
  other Discord extras.
- Push notifications through Expo/EAS notifications.
- Attachments: photos, videos, and files, viewable and playable in the app.
- Link previews with Open Graph title, description, and image.

## File storage

Vera's server stores media in the bunny.net Storage zone `vera-media` (New
York) and serves it from the CDN pull zone at `media.vera.chat`. The app
uploads straight to Storage's S3-compatible endpoint through a URL the PDS
presigns for one object path (`dev/` or `prod/` prefix per deployment). Videos
are capped at 2 minutes and served as plain files from the CDN; Bunny Stream
is not used. File storage sits behind a provider interface in the backend, so
a self-hoster can plug in another provider; without bunny.net variables the
backend falls back to Convex file storage.

## Sign-up and sign-in

Better Auth with passkeys only: no passwords, no email codes, no social sign-in.
Every account creates a passkey at sign-up, and passkeys are the only way to
sign in. Later, web and other clients will sign in by scanning a code with the
phone.

Sign-up requires an invite code. Codes are stored in Convex, are multi-use, and
stay valid until deactivated. Shawn asks the agent to create a code, sends it to
friends, and later asks the agent to deactivate it. The repo skill
`.claude/skills/invite-codes` describes the procedure.

## Mobile stack

- `apps/mobile`: latest Expo SDK and React Native.
- Native UI through `@expo/ui`; the app should feel as native as possible.
- Styling with Uniwind (Tailwind v4).
- iOS and Android. App Store and Play Store submission comes later.
- No Expo Go. EAS build profiles:
  - `development`: development client with hot reload (only when Shawn asks
    for a dev client by name).
  - `internal`: Shawn's standalone test builds against the dev PDS.
  - `production`: store builds, for TestFlight and the App Store.
- Over-the-air updates (EAS Update) first; a store build only when native
  code changed. See [releasing.md](releasing.md).
- Agent workflow: one T3 Code worktree, agent, and PR per change, merged only
  on Shawn's approval (`AGENTS.md`, the `vera-feature` skill).
- EAS account: `directedbyshawn`.

## Infrastructure

- Convex team BSX, project `vera`. The production deployment backs both
  TestFlight and store builds, so data from testing carries into the App Store
  release. Development builds use a dev deployment in the same project.
- Leave the `old-vera` Convex project alone.
- DNS for `vera.chat` lives in Vercel (team `bsx-sh`). PDS discovery uses
  `_pds.<domain>` TXT records. Test records from the two-deployment demo
  (`_pds.a`, `_pds.b`) are removed once the production record exists. Clerk
  and Resend records belong to the old AI chat app and are removed.
- Passkey relying party ID is `vera.chat`. This is permanent: changing it
  invalidates every passkey. iOS and Android require
  `https://vera.chat/.well-known/apple-app-site-association` and
  `https://vera.chat/.well-known/assetlinks.json`. The production Convex
  deployment serves both from HTTP routes. Convex custom domains verify with a
  CNAME, which a bare domain cannot have, so a file-less Vercel project
  (`infra/vera-chat-domain`) owns `vera.chat`, forwards `/.well-known/*` to
  Convex, and redirects `/` to `www.vera.chat`.
- Web hosting, when needed, can go on Vercel or Cloudflare. When the web app ships, `/.well-known/*` on `vera.chat` must still reach
  the files above.
- CLIs are signed in: `vercel` (bentsignal), `eas` (directedbyshawn), `convex`
  (BSX), `wrangler` (Cloudflare). If a CLI lacks a feature, use the dashboard
  through Chrome.

## Current setup (2026-10-01)

| Thing                        | Value                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| Convex production            | `disciplined-hyena-211`, account domain `vera.chat`                                           |
| Convex development           | `perceptive-magpie-29`, account domain `dev.vera.chat`                                        |
| Bare domain                  | `vera.chat` → Vercel project `vera-chat-domain`, which proxies `/.well-known/*` to production |
| App Store Connect            | App "Vera Chat" (Apple ID `6818656155`, SKU `vera-ios`, bundle `chat.vera.app`); "Vera" was taken |
| App Store Connect API key    | Team key "Vera EAS" (Admin), `~/.appstoreconnect/` on Shawn's Mac; EAS uses it for credentials and submits |
| TestFlight                   | Internal group "Team" (Shawn); external group "Friends" with public link `https://testflight.apple.com/join/CqpKDW25`; App Review signs up with the "Apple App Review" invite code |
| Discovery records            | `_pds.vera.chat`, `_pds.dev.vera.chat` (Vercel DNS)                                           |
| Apple team                   | `39K6A9FP99` (bundle `chat.vera.app`)                                                         |
| EAS project                  | `@directedbyshawn/vera`, `5680db13-57a8-4b74-ae41-1f52abbda0b1`                               |
| Android dev keystore SHA-256 | `E6:A1:C5:45:…:44:5F` (in `PASSKEY_ANDROID_CERT_SHA256`)                                      |

Store builds signed by Google Play App Signing need that key's fingerprint
added to `PASSKEY_ANDROID_CERT_SHA256` and `PASSKEY_ORIGINS` too.

## Decentralization

Only Vera's own server runs for now, and self-hosting tooling is out of scope.
The code must stay decentralized in shape so easy self-hosting can be added
later: identities are addresses, data lives on the owner's home PDS, and clients
discover servers through DNS.

## Repository housekeeping

- Keep `shared/ui` (future web shadcn UI) and `shared/app-config`.
- `legacy/` (the old AI chat app) was removed; it remains in git history.
- Review `.plans/` before removing anything from it.
- Project knowledge lives in this repository. Do not use external memory or
  task CLIs, or Claude Code auto memory.
