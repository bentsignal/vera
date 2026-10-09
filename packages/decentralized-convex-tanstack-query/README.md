# `@decentralized-convex/tanstack-query`

A thin adapter for using typed PDS operations with an application's installed
TanStack Query version:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  mapPdsQueryData,
  pdsMutation,
  pdsQuery,
} from "@decentralized-convex/tanstack-query";

const messages = useQuery(
  pdsQuery({
    query: pds.messages.list,
    args: { conversationId },
  }),
);

if (messages.data.status === "success") {
  messages.data.result; // Message[]
}

messages.data.federation.status;
messages.data.federation.sources;

const sendMessage = useMutation(pdsMutation({ mutation: pds.messages.send }));
await sendMessage.mutateAsync({ body, conversationId, messageId });
```

The application uses its own TanStack hooks and installed TanStack Query
version. `pdsQuery` creates native query options from one explicit object;
ordinary TanStack options live under `options`:

```ts
const messages = useQuery(
  pdsQuery({
    query: pds.messages.list,
    args: { conversationId },
    options: {
      revealPartialResultsAfter: 1_000,
      retry: 3,
      select: (data) =>
        mapPdsQueryData(data, (messages) =>
          messages.filter((message) => message.body.length > 0),
        ),
      staleTime: 30_000,
    },
  }),
);
```

Query `data` is always an explicit state object: `loading`, `partial`,
`success`, or `error`. The actual operation value lives in `result` for partial
and successful states, so a successfully loaded `undefined` can never be
confused with loading. The same data envelope includes federation status and
per-source diagnostics, so applications do not need a second hook.

Partial results are hidden for `500ms` by default so normally fast PDS
responses appear together. `options.revealPartialResultsAfter` changes that
delay; `0` reveals partial data immediately. A complete result is never delayed.
After the initial result becomes complete, temporary disconnects retain each
source's last known data. Newly discovered PDSs synchronize in the background
without returning successful data to a loading or partial state.

For SSR routes that must not render until every initial PDS has responded, use
the same strict options object in the route loader and component:

```ts
function messagesQuery(conversationId: string) {
  return pdsQuery({
    args: { conversationId },
    options: { requireCompleteResults: true },
    query: pds.messages.list,
  });
}

export const Route = createFileRoute("/messages/$conversationId")({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(messagesQuery(params.conversationId)),
  component: Messages,
});

function Messages() {
  const { conversationId } = Route.useParams();
  const messages = useSuspenseQuery(messagesQuery(conversationId));
  messages.data.status; // "success"
  messages.data.result; // Message[]
}
```

Strict queries reject into the route error boundary if an initial PDS fails or
does not respond within `2_000ms`. `options.initialResponseTimeout` changes
that timeout. Once complete data is rendered, live subscriptions retain the
last known source data through temporary disconnects and synchronize newly
discovered PDSs in the background.

Connect the decentralized transport once when creating an account session:

```ts
const pdsQueryClient = new PdsQueryClient(client);

const disconnect = pdsQueryClient.connect(queryClient);
```

An application signed into several accounts at once can keep them in one
`QueryClient` by naming each session. Queries and mutations then pass the
session they run as, and each session's results are cached under its own key:

```ts
new PdsQueryClient(mayaClient, { session: "maya@vera.chat" }).connect(
  queryClient,
);
new PdsQueryClient(workClient, { session: "maya@work.example" }).connect(
  queryClient,
);

useQuery(
  pdsQuery({ args: {}, query: pds.messages.inbox, session: "maya@vera.chat" }),
);
useMutation(
  pdsMutation({ mutation: pds.messages.send, session: "maya@work.example" }),
);

// On sign-out, drop one account's cached queries.
queryClient.removeQueries({
  queryKey: pdsSessionQueryKey("maya@work.example"),
});
```

## Optimistic updates

A mutation can show its effect before the PDS answers. `optimisticUpdate`
changes the home PDS's query results, and so every `pdsQuery` showing them,
the moment the mutation starts. The change stays until the mutation's own
result reaches the client, and rolls back if it fails. It is Convex's
optimistic update, addressed by PDS requests:

```ts
const createNote = useMutation(
  pdsMutation({
    mutation: pds.notes.create,
    optimisticUpdate: (store, { body, id }) => {
      for (const { args, request, value } of store.getAllQueries(
        pds.notes.list,
      )) {
        if (value === undefined || args.owner !== me) continue;
        store.setQuery(request, [...value, { body, id }]);
      }
    },
  }),
);

createNote.mutate({ body, id: crypto.randomUUID() });
closeSheet(); // no waiting
```

- `getQuery(request)` and `setQuery(request, value)` read and replace one
  query's result; `getAllQueries(builder)` lists every loaded query of an
  operation with its args and exact `request`. Setting `undefined` shows a
  query that hasn't loaded as still loading, rather than as an answer.
- The update runs again whenever new results arrive, so it must depend only
  on the store and its arguments. It may set queries nothing watches yet,
  such as the detail of something just created; a screen opened next shows
  them at once.
- Let the client choose IDs for new things (passing them to the mutation)
  so the app can open them before the PDS answers.
- `mutateAsync` still resolves only once the result has reached every live
  query, so handle failures with `.catch` and don't await it before
  responding to the user.

`PdsQueryClient` updates TanStack's cache from live Convex subscriptions. The
core client owns home-first routing, PDS discovery, connection reuse, and
author-home mutations; the TanStack adapter only bridges those results into the
application's cache.
