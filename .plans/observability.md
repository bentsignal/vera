# Observability and client error handling (decided with Shawn, 2026-11-19)

**On hold until the data-pass stack (#267–#283) merges.** Then merge main
into this branch and build on it. Nothing is built yet; this records what
was decided so the work can start cold.

## What it's for

See the whole life of a request, from the tap on the phone through the
Convex function and back, for queries and mutations, from production
phones. Use it to find the connection failures ("stuck retrying", #343)
and what makes things slow. Shawn asks the agent to query the data and
draw charts; no vendor dashboards. Nothing that identifies a person goes
to a third party.

## Decisions

- **Axiom is the store.** Convex's log stream sends server events to it
  (Shawn sets that up in the Convex dashboard, about five minutes). The
  app sends its own events straight to Axiom with an ingest-only token
  and plain `fetch`, so reports arrive when Vera's backend is down and
  the code ships over the air.
- **Effect 4 for client logic, not for React components and not for the
  backend.** It covers what sits between screens and the server: sign-in
  and tokens, the connection, `@decentralized-convex/client`, the
  TanStack bridge, the outbox, uploads and updates. Typed errors there
  are the point: today a network failure and a real sign-out both become
  `null`. The backend stays plain Convex; the log stream gives its
  timings. Effect for the long AI actions is a later idea (actions have a
  real clock, so spans work there). Confect is not used.
- **The package boundary.** The decentralized Convex client packages may
  depend on Effect, contained inside them:
  - the main entry keeps its Promise API with no Effect type in it (add a
    CI check);
  - errors are plain tagged values a normal `switch` can handle;
  - an optional `/effect` entry exposes the same operations as Effects
    with typed errors, and its spans join the app's own tracer. Vera's
    app uses that entry itself.
  - Effect in every user's bundle is accepted. An app using Effect itself
    has to match the package's Effect version.
- **Linking client and server.** The phone makes a random action ID
  (`expo-crypto` `randomUUID`) and sends it as an optional mutation
  argument. The router logs it and does nothing else with it; Convex
  stamps that log line with its own `request_id`, which joins to the
  `function_execution` event. Join on action ID, account pseudonym and a
  time window. The outbox keeps the action ID with each item, so resends
  after a restart stay one action.
- **Queries carry no ID** (their arguments are the subscription key).
  Match them by account pseudonym, operation name, `run_reason` and time,
  and report an ambiguous match as ambiguous.
- **The account pseudonym** is an HMAC of the account ID with a secret in
  a server environment variable, made on the server and handed to the app
  in a query it already makes.
- **Our own sender to Axiom**, with a queue that survives app kills and
  offline stretches. Effect's OTLP exporter drops a failed batch
  (Effect-TS/effect #10694), and phones on bad connections are the ones
  to hear from.
- **One PR** for the whole thing. Inside it, build the event sender and
  the first events before the rewrite, so there are numbers from today's
  code on Shawn's phone to compare against.
- **Clean up server logs in the same pass**, before the log stream goes
  on: `assistantImages.ts:66` logs an image URL, and several assistant
  lines log conversation IDs or whole error objects. The router's line
  carries the pseudonym, never an account ID or email.

## Keep the server's request path small (from the data pass, 2026-11-19)

Convex loads a function's whole module graph on every request, so what a
function imports is part of its latency. Measured on the data-pass test
backend:

| Function                                                  | Bundle | Time       |
| --------------------------------------------------------- | -----: | ---------- |
| `release:breakingVersion`                                 |  32 KB | 0–7 ms     |
| "Who's typing" on the messages component, called directly | 120 KB | 16–36 ms   |
| The same query through `pds:dispatchQuery`                | 1.6 MB | 120–385 ms |

`services/backend/convex/pds.ts` imports the assistant hook
(`afterPdsMutation`), and through it the AI SDK (about 600 KB) and zod
(about 800 KB). Every query and mutation pays for that, the largest part
of the ~1 s a chat takes to open. The data pass is shrinking the router
to import only what dispatching needs, with the AI code behind scheduled
functions referenced by name, and adding a bundle-size guard and a note
in the docs.

Rules for this work:

- No Effect, Confect, Axiom SDK, OpenTelemetry or any other library in
  the router, the plugins, or any module they import.
- Server logging on that path is a plain `console.log` of one structured
  line. The log stream does the rest.
- Anything heavier (forwarding or enriching events) goes in its own
  module or an action, called by function reference, never imported.
- Check the bundle size of `pds.ts` and the plugin dispatchers before
  and after any backend change.
- Effect on the client is a separate question: it costs app bundle size
  and startup time, not time on every server call.

## Events wanted

Cold start, opening from a notification, opening a chat, sending,
reacting, and an over-the-air update (download and apply time by
device). Each is one wide event with timed steps. An action that never
gets an answer still sends a partial event at a deadline, with
`connectionState()` snapshots (connected, `hasEverConnected`, retries,
oldest request waiting). Then alerts for slow requests and outages, and
a comparison per release or update.

## The stuck-retrying lead (#343), not yet reproduced

- `homeToken` (`apps/mobile/src/features/session/federation-auth.ts`)
  turns a failed token request into `null`.
- Convex's client treats a null token as signed out: it asks once more
  with `forceRefreshToken`, then goes to `noAuth` and never asks again
  (`authentication_manager.ts`, `refetchToken`).
- `connection.ts` passes `setAuth` no `onChange`, so nothing hears it.
  Queries then run signed out and the screen says "Retrying…" with
  nothing retrying, until a restart makes a new client.
- The home token lasts about 15 minutes (Better Auth's default), so an
  open after a longer gap fetches one as the phone wakes.

Reproduce it in the simulator first (fail the token request on resume
with an expired saved token). The fix belongs in this work: tell a
failed fetch from a sign-out, and retry the first.

## Facts checked 2026-11-17

- Axiom's free plan: 500 GB/month ingest, 30-day retention, alerting and
  the MCP server (`mcp.axiom.co/mcp`, OAuth). The number of monitors
  isn't on the pricing page; check the console. A "basic" API token can
  be ingest-only for chosen datasets.
- Convex log stream events: `function_execution` has `execution_time_ms`,
  `user_execution_time_ms`, `status`, `error_message`, `run_reason`,
  `mutation_retry_count`, `occ_info`, `usage`, and `function.request_id`
  and `function.cached`. Delivery is best effort: events can be dropped
  or duplicated, so dedupe on `request_id`.
- Component calls made from a query or mutation get no event of their
  own (checked in the dev deployment's logs); only calls from actions
  do. One server timing per request, and the router's log line
  (`PDS_TRACE`, from the data pass) says which operation it was.
- Convex freezes `Date.now()` in queries and mutations.
  `performance.now()` is frozen in queries and advances in mutations.
- Convex rejects arguments its validator doesn't know, so the backend
  ships the optional action-ID argument first, and the app checks the
  PDS's version before sending it.
- Convex's client resends mutations on reconnect under the same session
  and request number, and the server dedupes them; that lasts for one
  app run only.
- Effect 4 is stable (4.1.4), ESM-only, and its Metro import bug
  (effect-smol #1861) was fixed in March. Measured with esbuild:
  `Effect.gen` with spans is 17 KB gzipped. Nobody has reported its OTLP
  exporter on Hermes either way, and Hermes bugs have come up before
  (Effect-TS/effect #8689, #8750).

## First steps when this starts

1. Merge main (with the data pass) into this branch.
2. Check Effect 4 on Hermes on iOS and Android: bundle size, startup
   time, an over-the-air update.
3. Reproduce #343 in the simulator.
4. Shawn turns on the log stream once the server logs are clean.
