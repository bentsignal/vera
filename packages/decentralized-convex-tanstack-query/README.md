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

`PdsQueryClient` updates TanStack's cache from live Convex subscriptions. The
core client owns home-first routing, PDS discovery, connection reuse, and
author-home mutations; the TanStack adapter only bridges those results into the
application's cache.
