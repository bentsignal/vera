# Vera backend

This is the thin PDS host used by Vera. Its complete plugin installation is the
single declaration in `convex/convex.config.ts`:

```ts
export default definePdsApp({
  components: [betterAuth],
  plugins: [accounts, messages],
});
```

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

For local federation testing, create `.env.a.local` and `.env.b.local` from
`.env.example`, then deploy each target:

```sh
pnpm --filter @vera/backend deploy:a
pnpm --filter @vera/backend deploy:b
```

Each deployment needs its own `FEDERATION_DOMAIN`. Better Auth is the current
Vera authentication choice; the decentralized Convex packages remain auth
provider agnostic. The same backend is currently deployed to the independent A
and B development deployments.

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
