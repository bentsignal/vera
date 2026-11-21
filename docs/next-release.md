# Next release: extra steps

One-off steps the next release needs on top of the normal flow in
[releasing.md](releasing.md). The `vera-release` skill requires working
through this file. Do every step in order, and check each one's **Verify**
before moving on. A step that fails or can't be done blocks the release; tell
Shawn instead of skipping it.

`pnpm release plan` lists these steps, and production builds and updates
refuse to run until `--next-release-done` confirms the ones due by then are
done. After the release, open a PR that removes the finished steps (leave
the heading and intro so the file stays in place for the next release).

Adding steps: any PR whose release needs something beyond `pnpm release`
adds a section here in that PR (see AGENTS.md → Releases).

## Turn on DNSSEC for vera.chat

**When:** any time before or after the release; nothing in it waits on
this, but do it this release.

The app now looks up every server's `_pds` record with two DNS resolvers
(Cloudflare and Google) and believes it only when they agree. DNSSEC on
vera.chat makes those answers signed, so neither resolver can be handed
a false record for Vera's own server.

vera.chat's DNS is on Vercel (docs/mobile-launch.md → Discovery records).

1. In the Vercel dashboard (Domains → vera.chat), or the registrar if
   Vercel's DNS can't sign the zone, turn on DNSSEC for vera.chat.
2. Add the DS record it gives you at vera.chat's registrar (the registrar
   may do this for you when it's also the DNS host).
3. If neither Vercel nor the registrar can sign the zone, stop and tell
   Shawn: moving vera.chat's DNS to a provider that can is his call.

**Verify:** both resolvers say the answer is signed (`"AD":true`):

```sh
curl -s "https://dns.google/resolve?name=_pds.vera.chat&type=TXT" | grep -o '"AD":[a-z]*'
curl -s -H 'accept: application/dns-json' \
  "https://cloudflare-dns.com/dns-query?name=_pds.vera.chat&type=TXT" | grep -o '"AD":[a-z]*'
```

Then sign in to Vera on a phone and open a conversation: it still loads.
