# `@decentralized-convex/messages`

The product-agnostic messaging Component used by Vera and any other compatible
decentralized Convex client. The host PDS owns authentication; the Component
owns message storage and derives authorship from the forwarded identity.

```ts
import messages from "@decentralized-convex/messages/convex.config";

app.use(messages);
```
