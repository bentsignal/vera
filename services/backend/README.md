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

Passkeys are the only credential. Sign-up is open: it sends the username as
the passkey registration `context`; the server checks it when issuing
registration options, checks again after the passkey is verified, then creates
the account and starts a session.

Usernames that look official are reserved: `DEFAULT_RESERVED_USERNAMES` from
`@decentralized-convex/address` (`admin`, `help`, `support`, `security`, and
so on) plus Vera's own (`vera`, `vera_support`, ...) in `convex/auth.ts`. The
check ignores case, dots, dashes, underscores, and trailing digits, so
`Help_Desk2` is reserved too, and a reserved name fails with
`USERNAME_TAKEN`. Nobody can sign up with one. Accounts that need one, such as
`support`, are created on the server (`npx convex run support:setup`).

Accounts that speak for Vera, such as `support@vera.chat`, can be marked
affiliated. The app then shows a verified check next to their names, and
tapping it explains that the account is an official account of the domain.
Only accounts on this deployment's `FEDERATION_DOMAIN` can be affiliated.

```sh
npx convex run affiliations:add '{"address":"support@vera.chat"}'
npx convex run affiliations:remove '{"address":"support@vera.chat"}'
npx convex run affiliations:list
```

## Assistants: Support and Vera

Two verified accounts answer direct messages with a model:

- `support@<account domain>` helps people report bugs. It asks for what's
  missing (what happened, where, how to repeat it, a screenshot), tells them
  reports are public and waits for their answer, checks GitHub for an
  existing issue or fix (following that issue instead of filing a
  duplicate), then files an anonymized GitHub issue labeled "user report"
  with the app version and device the app reported. Screenshots never go in
  an issue: support describes what they show in words, without personal
  details. A cron (`crons.ts`, every 10 minutes) follows each issue and
  tells the reporter, in plain words, when it's picked up (assigned), being
  worked on (an open PR that says `Fixes #N`), fixed (merged), and out:
  "live now" when an over-the-air update or backend deploy shipped it, or
  "update it from TestFlight or the App Store" (Google Play on Android, from
  the OS their app reported) when it took a store build. A PR labeled
  "📱 Native Change" only counts as out once that phone's store build has
  it. People who say they're developers also get the links.
  See the `support-inbox` agent skill for the operator commands.
- `vera@<account domain>` is a general assistant: short, direct answers in
  plain text. It remembers how each person wants it to answer when they ask
  it to (`botNotes`), searches the web through Parallel (`webSearch.ts`), and
  remembers the whole conversation (`memory.ts`).

Assistants text like people: usually one short message, two when it helps,
at most 3 per reply, spaced 1.2 to 4 seconds apart by length. They don't
have to reply every time: when a conversation seems over, or the person
clearly has more to say, the model can send nothing (`stay_quiet`). A reply
waits while the person is typing (rechecking every few seconds, for up to
30), so a follow-up gets answered with the first message. The last thing
the model reads before answering lists its current tools, so what it said
about itself earlier in a chat (before a tool existed) can't override them.

Vera's web search uses Parallel's Search API in fast mode ($1 per 1,000
searches), which returns short excerpts chosen for the question, capped so
little text reaches the model. One search per reply (a second only when the
first finds almost nothing). Results are kept a day
for follow-up questions and cleared by a daily cron. In testing, an answer
that searched cost about 1.3¢ and one that didn't about 0.4¢.

Vera's memory: every exchange (2 messages) becomes a passage with an
embedding (OpenAI text-embedding-3-small at 512 dimensions, through the
gateway), in Convex vector search. Before each reply, the closest distinct
passages older than the 40 messages it sees (similarity 0.25 or more, up to 3) are added to its instructions oldest first, so a fact that changed reads
in order; `search_memory` looks further. Editing or deleting a message
rebuilds its passage. In benchmarks on 320- and 500-message conversations
with facts that changed (a budget, a move, a new job), it answered 35 of 35
recall questions correctly, including saying it didn't know things that
were never said. Passages of 10 and 4 messages matched worse, and larger
embedding models didn't do better.

Photo-only messages skip the automatic memory lookup because there is no
text to embed. The model still sees the photo and the recent conversation.
Empty or whitespace-only memory searches return no matches without calling
the embedding provider.

`npx convex run usage:summary '{"bot":"vera"}'` totals what replies cost
(tokens, dollars, searches), from the gateway's own numbers.

When an issue is closed without a fix, support follows the original issue
if it was marked as a duplicate. If the team left a comment when closing
it, support's model explains that comment to the reporter in plain words
(`convex/supportClosures.ts`). Otherwise the reporter gets a fixed message.
Whether a report is worth filing at all (not a joke or spam) is the model's
call, with no daily cap.

Both welcome every new account (a Better Auth `user.create` hook schedules
`support:welcome` and `vera:welcome`) and create themselves the first time
they're needed. `npx convex run vera:welcomeEveryone` says hello to
accounts made before Vera existed.

How it works (`convex/bots.ts`, `convex/agent.ts`):

- The PDS router's `afterMutation` sees each message someone on this PDS
  sends. A direct message to an assistant schedules its reply 1.5 seconds
  later; another message pushes it back, so a burst gets one answer.
- One reply runs per conversation at a time. It reads the latest 40
  messages and calls the model with the assistant's instructions and tools.
  The model answers only through `send_message`, which can write to that
  one conversation and nowhere else; no tool takes an account or
  conversation, so nothing can reach another person's messages. Text it
  writes outside a tool is never sent: a reply that ends with neither a
  message nor `stay_quiet` is an error, and the model gets one more try,
  told why (`reply-outcome.ts`). At most 3 messages per reply, not
  counting canned ones like support's privacy notice. Messages that
  arrive during a reply get the next one.
- Models run through the Convex AI Gateway (`@convex-dev/ai-sdk-provider`
  and the AI SDK), billed on the Convex bill, with zero-data-retention
  routing (`assistant-models.ts`). Grok 4.7 answers, and Gemini 4 Argon
  takes over when it fails: each model gets two tries, or one when the
  error says retrying won't help (a rejected request), before the next.
  The model sees the newest few images in the conversation, in the formats
  it reads. Grok can't read HEIC (how iPhones save photos) or GIF, so
  Gemini answers first while one of those is among them; a format neither
  reads shows as a note. One image a model can't read fails the whole
  request, which is what took both assistants down on 2026-10-23.
- The app sends the device's time zone after a message to an assistant
  (`timeZones:report`), so they know the person's date and time.
- Each person gets at most 300 replies an hour from Vera and another 300
  from Support, counted separately, on a rolling basis (a token bucket per
  assistant that refills continuously). Each separate time they run one
  dry is a strike; 5 strikes within a day pause that assistant for them
  until the day is up. Over a limit, the assistant
  says so once, without calling the model. The rules are plain functions in
  `assistant-limits.ts` (tested); `convex/rateLimits.ts` stores them, with
  `rateLimits:status` and `rateLimits:reset` for operators. (Convex's rate
  limiter Component doesn't fit: it installs a Component of its own, which
  breaks importing `convex.config.ts` outside Convex, as `http.ts` and
  `pds.ts` do.)
- They only hear from people on this PDS: a message from another PDS is
  stored there and never reaches this one.
- The app reports its version and device to `supportReporters:reportClient`
  after a message to support, and nowhere else.

The AI Gateway needs the Convex team on a paid plan. It works on cloud
dev and production deployments without any key.

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
| `PASSKEY_APPLE_APP_IDS`       | `39K6A9FP99.chat.vera.app,...`       | Apps listed in the Apple app site association |
| `PASSKEY_ANDROID_PACKAGE`     | `chat.vera.app,chat.vera.app.dev`    | Android apps listed in `assetlinks.json`      |
| `PASSKEY_ANDROID_CERT_SHA256` | `AB:CD:...`                          | Comma-separated Android signing fingerprints  |
| `BUNNY_S3_ENDPOINT`           | `https://ny-s3.storage.bunnycdn.com` | bunny.net Storage S3 endpoint                 |
| `BUNNY_S3_REGION`             | `ny`                                 | Region used to sign uploads                   |
| `BUNNY_STORAGE_ZONE`          | `vera-media`                         | Storage zone (also the S3 access key)         |
| `BUNNY_S3_SECRET`             | secret                               | Storage zone password                         |
| `BUNNY_CDN_URL`               | `https://media.vera.chat`            | Public base URL for media                     |
| `BUNNY_PATH_PREFIX`           | `prod`                               | Folder for this deployment's uploads          |
| `GITHUB_TOKEN`                | secret                               | Files and follows support's bug reports       |
| `GITHUB_REPOSITORY`           | `bentsignal/vera`                    | Where support files bug reports               |
| `PARALLEL_API_KEY`            | secret                               | Vera's web search (Parallel)                  |

Attachment size limits (videos 500 MB, photos 50 MB, other files 100 MB) and
the 2-minute video cap live in `upload-limits.ts`. The app imports the same
file to turn away a file when it's picked, so change them there.

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
