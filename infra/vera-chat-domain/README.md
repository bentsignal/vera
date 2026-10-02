# vera.chat domain

A file-less Vercel project (`vera-chat-domain`, team `bsx-sh`) that owns the
bare `vera.chat` domain. It forwards `/.well-known/*` to the production Convex
deployment, which serves the passkey app association files and PDS discovery
manifest, and redirects `/` to the website at `www.vera.chat`.

It exists because Convex verifies custom domains with a CNAME record, which DNS
does not allow on a bare domain. Passkeys need `vera.chat` itself (the relying
party ID), so a subdomain would not work.

Deploy after changing `vercel.json`:

```sh
cd infra/vera-chat-domain
vercel deploy --prod
```
