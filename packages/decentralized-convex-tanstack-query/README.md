# `@decentralized-convex/tanstack-query`

A thin adapter for using typed PDS operations with an application's own
TanStack Query hooks and version:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  mapPdsQueryData,
  pdsMutation,
  pdsQuery,
} from "@decentralized-convex/tanstack-query";

const messages = useQuery(pdsQuery(pds.messages.list, { conversationId }));

if (messages.data.status === "success") {
  messages.data.result; // Message[]
}

const sendMessage = useMutation(pdsMutation(pds.messages.send));
await sendMessage.mutateAsync({ body, conversationId, messageId });
```

Both helpers return normal TanStack options, so every TanStack override remains
available:

```ts
const messages = useQuery({
  ...pdsQuery(pds.messages.list, { conversationId }),
  retry: 3,
  select: (data) =>
    mapPdsQueryData(data, (messages) =>
      messages.filter((message) => message.body.length > 0),
    ),
  staleTime: 30_000,
});
```

Query `data` is always an explicit state object: `loading`, `partial`,
`success`, or `error`. The actual operation value lives in `result` for partial
and successful states, so a successfully loaded `undefined` can never be
confused with loading.

Connect the decentralized transport once when creating an account session:

```ts
const pdsQueryClient = new PdsQueryClient(client);

const disconnect = pdsQueryClient.connect(queryClient);
```

`PdsQueryClient` updates TanStack's cache from live Convex subscriptions. The
core client owns home-first routing, PDS discovery, connection reuse, and
author-home mutations; the TanStack adapter only bridges those results into the
application's cache.
