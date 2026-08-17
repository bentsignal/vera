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

Connect the decentralized transport once when creating an account session:

```ts
const pdsQueryClient = new PdsQueryClient(client);

const disconnect = pdsQueryClient.connect(queryClient);
```

`PdsQueryClient` updates TanStack's cache from live Convex subscriptions. The
core client owns home-first routing, PDS discovery, connection reuse, and
author-home mutations; the TanStack adapter only bridges those results into the
application's cache.
