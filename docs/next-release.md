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

## Signed over-the-air updates

From this release on, every update is signed with a key kept in this
Mac's Keychain, and store builds carry the certificate that checks it
(docs/releasing.md → Signed updates).

### 1. Expo plan that can sign (Shawn)

**When:** before the first `pnpm release ota` after this merges. Without
it, `eas update` refuses to sign and every update fails.

Expo signs updates only on its Production plan or higher
(expo.dev → account `directedbyshawn` → Settings → Subscriptions).

**Verify:** `pnpm release ota internal "Signing check"` publishes (internal
reaches only Vera Dev internal builds).

### 2. Back up the signing key (Shawn)

**When:** before the store build in step 3.

```sh
security find-generic-password -s chat.vera.update-signing-key -a vera -w | pbcopy
```

Paste it into a new secure note in your password manager, "Vera update
signing key", then copy something else to clear the clipboard.

**Verify:** `pnpm release signing-key check` says the key matches.

### 3. Store builds carry the certificate

**When:** the next store build (`pnpm release build production`, and
`--android`). `pnpm release build` refuses a binary without the
certificate, so nothing extra to run.

**Verify:** after the first signed `pnpm release ota production`, the
new TestFlight build shows the update's ID in More → About.
