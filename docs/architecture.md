# Decentralized Convex architecture

## One concept from package to wire

A package owns its release metadata, and its plugin protocol consumes that
local export:

```ts
export const decentralizedConvexPackage =
  defineDecentralizedConvexPackage({
    name: "@decentralized-convex/messages",
    lastChanged: "0.1.0",
  });

export const messagesProtocol = definePluginProtocol({
  lastChanged: decentralizedConvexPackage.lastChanged,
  name: "messages",
  requires: { accounts: DECENTRALIZED_CONVEX_VERSION },
  queries: { list: defineOperation(/* validators */) },
  mutations: { send: defineOperation(/* validators */) },
});
```

- `name` is the Convex Component install name and wire plugin discriminator.
- the ecosystem `version` is injected from one release source of truth;
- `lastChanged` comes from the package that owns the plugin and records when
  that package actually changed;
- `requires` is validated against the complete deployment at type-check and
  Convex config evaluation time.
- operation validators produce client argument/result types and enforce the
  same contract inside the Component.

There is no separate in-memory plugin model or manually maintained router
registry.

## Server setup

Each plugin exports a normal Convex Component whose TypeScript type carries its
protocol. The host imports that single value through the `convex.config` path
required by Convex and never manually pairs a Component with its protocol.

The host calls `definePdsApp({ auth, plugins, components })`. It:

1. checks duplicate names, missing plugins, and incompatible ecosystem versions
   through the plugin tuple's TypeScript type;
2. installs each plugin as a normal Convex Component;
3. derives public auth descriptor metadata from the optional auth adapter;
4. installs other Components, including the auth system's own, without
   treating them as PDS protocols. Convex requires every Component import to
   be written directly in `convex.config.ts`; importing one indirectly through
   another module makes the push fail.

The protocol marker is deliberately type-only. Convex replaces imported
Component definitions while evaluating `convex.config.ts`, so runtime metadata
attached to the original object would be lost. This design keeps the standard
Convex commands and bundling behavior intact.

Outside Convex's config evaluator, the plugin packages also register their
protocol objects in a private local map. The backend's stable `pds` module reads
that map from the same app declaration to build the browser API and discovery
capability list. No second plugin registry is maintained.

Convex code generation then discovers the public exports in
`services/backend/convex/pds.ts`. The web client addresses them by their stable
wire names, `pds:dispatchQuery` and `pds:dispatchMutation`, so it does not need
the generated API of any particular independently hosted backend.

## Request path

A Messages read follows this path:

```text
useQuery(pdsQuery({ query, args, options }))
  -> pds:dispatchQuery on the signed-in account's home
  -> typed data plus hidden conversation routing identities
  -> current PDS discovery for those identities
  -> pds:dispatchQuery on each discovered deployment
  -> root authentication and plugin selection
  -> messages.dispatcher.dispatchQuery
  -> exact operation/last-changed/argument validation
  -> list handler and Component database
  -> per-source results merged into the application's TanStack cache
```

A query's result can also name the queries the app asks for next to show it
(`queryResult(data, { include, routes })` in `@decentralized-convex/server`):
a page of messages includes its reactions, thread summaries, and the profiles
it shows; the Inbox includes the profiles its rows show. The root router
answers them in the same Convex query, one Component call per plugin
(`dispatchQueries`), and the client caches each under the key the app would
use, so the screen needs one round trip instead of a chain of them. Only
results the home PDS answers completely are cached this way; one whose routes
lead to other PDSs is left for its own query, and an app or PDS that predates
included queries just asks for each one as before.

A write follows the same path through `pds:dispatchMutation`, targeting only the
author's home PDS. The root router resolves identity once and passes the small
identity value across one Component boundary.

### A PDS speaks only for its own accounts

**Invariant: a PDS is believed only about its own accounts.** Its own
accounts are those on the domain whose discovery (`_pds` DNS record, then
manifest) led to it. Everything a PDS answers about any other account is
left out before an app sees it, whichever PDS it is, the home PDS
included.

The client library enforces it, so no app built on it can skip it:

- A query gathered from several PDSs (one whose result has `routes`)
  declares `trust` on its operation (`defineOperation({ args, returns,
  trust })`): given one PDS's answer and `owns(accountId)`, it returns the
  answer with everything about other accounts removed.
  `@decentralized-convex/client` runs it on every PDS's answer before
  anything combines them, and on included results the home PDS answers.
- A query without `trust` is believed only from the home PDS. Other PDSs'
  answers to it become errored sources (`UntrustedPdsAnswerError`), as
  does an answer its `trust` can't read.
- Each PDS is asked, signed in to, and believed per domain: a manifest that
  names another domain's deployment gets its own connection, signed in for
  its own domain, and its answers count only for its own accounts.
- Discovery believes a `_pds` record only when Cloudflare's and Google's
  DNS-over-HTTPS resolvers agree on it, and only a manifest for the domain
  looked up.

Because each PDS sends only its own accounts' rows, a copy from a PDS that
isn't the author's never reaches the app, so it can't overwrite the
author's. Two authors claiming one message ID can't both be right; the
Vera app never lets the later one replace the other
(`apps/mobile/src/features/messaging/window-model.ts` → `preferredCopy`).

What the Messages and Accounts plugins believe from whom:

| Data                                          | Believed from                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Messages, edits, deletions, link previews     | The author's PDS                                                                                                          |
| A reply's quote of another server's account   | Who and which message, from the replier's PDS; not the quoted words                                                       |
| A thread's original message                   | Its author's PDS                                                                                                          |
| Reactions, typing                             | The reacting or typing account's PDS                                                                                      |
| Thread summaries and lists (counts, repliers) | Each PDS for the replies it stores, naming only its own repliers; a count with none of its own repliers is dropped        |
| Profiles (names, photos, `affiliated`)        | The account's own PDS, and only as the profile asked for                                                                  |
| Conversations, inbox, members, names, spaces  | The home PDS only (these queries aren't gathered from other PDSs)                                                         |
| The verified check                            | Only `@vera.chat` accounts show it in the Vera app, whatever another PDS says (`apps/mobile/src/features/profile/verified.ts`) |

Not checkable this way: a PDS can still overstate how many replies it
stores, or its own accounts' place in a thread; both only change counts and
dots, never who said what.

### Function bundles

Convex loads all the code a function's module imports each time the
function runs, so what a module imports adds to the latency of every call
to it, whatever the call reads. Every request to a PDS goes through the
router (`pds.ts`) and a plugin's dispatcher, so their imports are paid on
every query and mutation the app makes. Measured on a Vera deployment
(Nov 2026), uncached, on the server:

| Module                                   | Bundled  | A 7-document query |
| ---------------------------------------- | -------- | ------------------ |
| A tiny query (`release.ts`)              | 32 KB    | 0–7 ms             |
| The messages plugin's dispatcher         | 120 KB   | 16–36 ms           |
| The router, importing the assistants' AI | 1.6 MB   | 120–385 ms         |
| The router, without it                   | 45 KB    | about 20 ms        |

The router's `afterMutation` hook had pulled in the AI SDK and zod through
the assistant code it starts. Opening a chat paid for it four times over,
one for each query a chat opens with.

So:

- The router, its hooks, and the plugins import only what dispatching and
  deciding need. Work a hook starts goes in another function, scheduled by
  reference (`ctx.scheduler.runAfter(0, internal.x.y, …)`); importing a
  module for its `internal` reference costs nothing, importing it for a
  helper loads all of it. Helpers that both sides need go in a small module
  of their own (as `botAccounts.ts`, `summonStart.ts`, and `threadFollow.ts`
  are split from what they start).
- Libraries for models, schemas, telemetry, or effects (the AI SDK, zod,
  Effect, OpenTelemetry, vendor SDKs) stay off that path entirely: in
  actions, or in modules only actions import. Server logging on that path
  is a plain `console.log` of one line.
- `services/backend/function-bundles.test.ts` bundles the router and both
  plugin dispatchers and fails past each one's budget, naming the largest
  packages. Raise a budget only after measuring what the extra code costs a
  call.

## Package boundaries

`@decentralized-convex/plugin` knows about contracts, not React, authentication,
Vera, or deployment routing.

`@decentralized-convex/server` knows how to install and dispatch protocols and
the generic shape of a PDS auth adapter, but not Vera's messaging policy or any
specific auth vendor.

`@decentralized-convex/auth-better-auth` bridges a normally configured Better
Auth instance to the public PDS federation-auth endpoints. Better Auth remains
a peer dependency, and its database, providers, sessions, callbacks, and UI
remain entirely under the host's control. The config-time adapter is separated
from its server-only runtime bridge so importing the generated PDS API does not
bundle Better Auth into clients.

`@decentralized-convex/client` knows deployments, connections, authentication
token callbacks, subscriptions, and typed protocol requests. React and
TanStack Query integrations remain optional packages.

Accounts and Messages own their schemas and operation implementations. Vera's
backend supplies its normal Better Auth configuration to the adapter. Vera's
web app supplies product-specific conversation selection and presentation.

## Defaults and extension points

The default path intentionally needs only:

- `definePdsApp` on the server;
- one stable backend `pds` export inferred from that app definition;
- the application's native `useQuery(pdsQuery({ query, args, options }))` for
  reactive reads and federation diagnostics in `data`;
- the application's native `useMutation(pdsMutation({ mutation, options }))`
  for writes.

PDS query `data` is a discriminated `loading`, `partial`, `success`, or `error`
object. Partial and successful states carry the operation value as `result`;
loading is never represented by an ambiguous `undefined` value. Every state
also carries federation status and per-source diagnostics.

Initial partial data remains loading for `500ms` by default and can be tuned
with `options.revealPartialResultsAfter`. Complete data bypasses the delay. Once
every initial PDS has responded, the query remains successful: temporary
disconnects retain last-known source data, and newly discovered PDSs load in
the background instead of resetting the visible result.

Applications may override:

- ordinary Component install names and HTTP prefixes;
- the root app HTTP prefix;
- connection creation and destination-aware token fetching;
- explicit lower-level federation targets;
- result combination and deduplication;
- TanStack query keys and enablement;
- the canonical root query and mutation references through `PdsClient`.

## Proven and not yet proven

The two deployed Vera development PDSs have proven address discovery,
destination-bound authentication, private reads and writes, reactive remote
updates, root dispatch, exact Component validation, and author-home storage.

Still prototype-only:

- the web app uses one explicit two-domain conversation fixture, but its
  routing is stored on each account's home and discovered through product data;
- the UI holds one active account rather than concurrent accounts;
- the Better Auth adapter covers the existing home-to-remote assertion
  exchange, while universal client-to-home sign-in is the next auth slice;
- auth lacks scopes, revocation, replay limits, and resource-specific policy;
- Component migration execution, persisted upgrade state, and large plugin
  graphs still need a production design;
- packages are private workspace packages and self-hosting is not productized.
