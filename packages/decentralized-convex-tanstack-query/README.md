# `@decentralized-convex/tanstack-query`

A thin adapter for using typed PDS operations with an application's own
TanStack Query hooks and version:

```ts
import { useMutation, useQuery } from "@tanstack/react-query";
import { pdsMutation, pdsQuery } from "@decentralized-convex/tanstack-query";

const messages = useQuery(pdsQuery(pds.messages.list, { conversationId }));

const sendMessage = useMutation(pdsMutation(pds.messages.send));
await sendMessage.mutateAsync({ body, conversationId, messageId });
```

Both helpers return normal TanStack options, so every TanStack override remains
available:

```ts
const messages = useQuery({
  ...pdsQuery(pds.messages.list, { conversationId }),
  retry: 3,
  select: (messages) => messages.filter((message) => message.body.length > 0),
  staleTime: 30_000,
});
```

Connect the decentralized transport once when creating an account session:

```ts
const pdsQueryClient = new PdsQueryClient(client);

const disconnect = pdsQueryClient.connect(queryClient);
```

`PdsQueryClient` updates TanStack's cache from live Convex subscriptions. The
core client owns home-first routing, PDS discovery, connection reuse, and
author-home mutations; the TanStack adapter only bridges those results into the
application's cache.
