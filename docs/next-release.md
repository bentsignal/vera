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

## From PR #89: space invitations and invite links

Merged 2026-10-05. Inviting people to a space now sends an invitation, and
members can make expiring invite links (`https://vera.chat/join/<code>`;
Vera Dev's are `https://vera.chat/dev/join/<code>`). Tapping a link opens the
app through iOS universal links and Android app links. Where the app doesn't
open (a computer, or a phone without Vera), vera.chat shows a page with an
"Open in Vera" button.

### 1. This release is a store build on both platforms

PR #89 changed native config (`app.config.ts`: the `applinks:vera.chat`
associated domain on iOS and an Android intent filter). An over-the-air
update can't carry it. Expect `pnpm release plan` to say `kind: store-build`,
and tell Shawn it's a store build because of this.

For the dev-client test (skill step 2), `scripts/phone.sh up` builds a new
dev client first (about 15 minutes, once), and Shawn has to install it on
both phones. Say so when you send the links. Tapping an invite link in
Messages and landing in the app can't be tested in the dev client yet; it
needs steps 2 and 3 below first.

**What to test** (add to the test plan): invite someone to a space, then as
them accept from Spaces → Invites, and decline another invite. In a space,
use Invite Links → Create Invite Link to make a link and share it, open it
as another account, and join. Also turn a link off and confirm it then shows
"Invite Invalid".

### 2. Deploy the production backend first

Do this before any store build goes to testers, even if `plan` didn't
flag the backend:

```sh
pnpm release backend production
```

It ships the new invitation tables and operations, the `/join/` fallback
page, and the `applinks` section of the Apple app site association.

**Verify:**

```sh
curl -s https://disciplined-hyena-211.convex.site/.well-known/apple-app-site-association
# must contain "applinks" with "/join/*" for chat.vera.app and "/dev/join/*" for chat.vera.app.dev
curl -s https://disciplined-hyena-211.convex.site/join/test | grep "Join a space on Vera"
```

### 3. Deploy the vera.chat Vercel project

`pnpm release` doesn't do this. The project forwards `vera.chat/join/*` and
`vera.chat/dev/join/*` to the production page from step 2. Until it's
deployed, those links return a Vercel 404 in a browser. Deploy after step 2
and before builds reach testers:

```sh
cd infra/vera-chat-domain
vercel deploy --prod      # team bsx-sh, signed in as bentsignal
```

**Verify:**

```sh
curl -s https://vera.chat/join/test | grep "Join a space on Vera"
curl -s https://vera.chat/dev/join/test | grep "Open in Vera Dev"
curl -s --compressed https://vera.chat/.well-known/apple-app-site-association | grep applinks
```

### 4. iOS store build and TestFlight, only after steps 2 and 3

Run the normal store build (`pnpm release build production`, then
`pnpm release testflight`). iOS reads the app site association from Apple's
cache when the app is installed, which is why steps 2 and 3 come first.

**Verify** on Shawn's iPhone once the TestFlight build is installed: in
Vera, make an invite link, send it to yourself in Messages, and tap it. It
must open the join sheet in Vera, not Safari. If Safari opens, delete and
reinstall the TestFlight app, or wait a few hours for Apple's cache, then
try again. Tell Shawn if it still opens Safari.

### 5. Android: set up Google Play internal testing

Shawn wants Play internal testing for his friend and his Android test phone.
It replaces the APK link for them.

**Prerequisite (Shawn, not the agent):** a Google Play developer account
($25 once, government ID check that can take days). If it doesn't exist
yet, ask Shawn. Android then ships as a production APK (`pnpm release build
production --android`) this time, and invite links already work in that
APK. Leave this step in this file for the next release.

With the account, follow
[android.md → Google Play internal testing](android.md#google-play-internal-testing-the-testflight-equivalent)
(create the app `chat.vera.app`, upload the first `.aab` by hand from the
`production` profile, set up `eas submit` on track `internal`, and add Shawn
and his friend as testers). Then do this step, which links depend on:

**Add the Play App Signing key**, or invite links on Play builds open the
browser instead of the app (passkeys need it too). Copy the app signing
key's SHA-256 from Play Console → Test and release → App integrity, then
add it on **both** Convex deployments (production and `perceptive-magpie-29`):

- append it to `PASSKEY_ANDROID_CERT_SHA256` (comma-separated, keep the
  existing values)
- append its `android:apk-key-hash:<base64url of the SHA-256 bytes>` form to
  `PASSKEY_ORIGINS`

```sh
cd services/backend
npx convex env get PASSKEY_ANDROID_CERT_SHA256 --prod      # read, then set the old value plus the new one
npx convex env set PASSKEY_ANDROID_CERT_SHA256 "<old>,<new>" --prod
# the same for PASSKEY_ORIGINS, then both again without --prod for the dev deployment
# (from a checkout on the shared dev deployment: `scripts/backend.sh status` shows perceptive-magpie-29)
```

**Verify:**

```sh
curl -s https://vera.chat/.well-known/assetlinks.json   # lists chat.vera.app with the Play key's fingerprint
```

Then on the Android test phone, with the Play build installed: tap an invite
link from Messages. It must open the join sheet in Vera, and passkey
sign-in must still work.

### 6. Tell Shawn

In the release report, list each step above and whether it's done: the
backend deploy, the Vercel deploy, the TestFlight link check, and the Play
setup with the signing key added (or still waiting on his account).

## From the release test: deactivate the session invite code

Made 2026-10-10 on the dev PDS (`perceptive-magpie-29`) so Shawn could
create test accounts during the release test: code `9AEP-SC77`, label
"release test session 2026-10-10 (deactivate after testing)". It isn't on
production. Deactivate it once Shawn says testing is done, before the
release report, and tell him:

```sh
cd services/backend   # on the shared dev deployment
npx convex run invites:deactivate '{"code":"9AEP-SC77"}'
```

**Verify:** `npx convex run invites:list` shows it with `active: false`.
