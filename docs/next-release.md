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

## One account per phone at sign-up

Sign-up now asks each phone to prove which phone it is (Apple's
DeviceCheck on iPhone, Google Play Integrity on Android), and production
refuses a second account from the same phone. Older binaries can't send
that proof, so the check stays off on production until the store builds
that can are out. Background: `services/backend/sign-up-devices.ts`.

### 1. Keep the check off for now

**When:** before the first backend deploy that includes this change.

From `services/backend`:

```sh
npx convex env set --prod SIGN_UP_DEVICE_CHECK off
```

Without it, production would refuse every sign-up from today's binaries.

**Verify:** `npx convex env get --prod SIGN_UP_DEVICE_CHECK` prints `off`.

### 2. Apple DeviceCheck key (Shawn, or Codex in the Apple Developer site)

**When:** any time before step 5.

1. developer.apple.com → Certificates, Identifiers & Profiles → Keys → **+**.
   Name it "Vera DeviceCheck", tick **DeviceCheck**, Continue, Register,
   and download the `.p8` (Apple offers the download once). Note the Key ID.
2. From `services/backend`:

   ```sh
   npx convex env set --prod APPLE_TEAM_ID 39K6A9FP99
   npx convex env set --prod DEVICECHECK_KEY_ID <Key ID>
   npx convex env set --prod DEVICECHECK_PRIVATE_KEY "$(cat ~/Downloads/AuthKey_<Key ID>.p8)"
   ```

3. Keep the `.p8` somewhere safe outside the repo (or delete it: a new key
   can always be made).

**Verify:** `npx convex env list --prod | grep -c DEVICECHECK` prints 2.

### 3. Play Integrity (Shawn, or Codex in Play Console and Google Cloud)

**When:** any time before step 5.

1. Play Console → Vera → Test and release → App integrity → Play Integrity
   API → **Link a Cloud project** → the existing project `vera-c5690`
   (number 863019500780, the Firebase project; the app asks Google for
   this number, `apps/mobile/src/features/session/device-proof.ts`).
2. Google Cloud console, project `vera-c5690` → IAM & Admin → Service
   accounts → Create: `play-integrity`, no roles. Keys → Add key → JSON.
3. From `services/backend`:

   ```sh
   npx convex env set --prod PLAY_INTEGRITY_SERVICE_ACCOUNT "$(cat ~/Downloads/vera-c5690-*.json)"
   ```

   then delete the downloaded JSON.

**Verify:** `npx convex env list --prod | grep -c PLAY_INTEGRITY` prints 1.

### 4. Store builds on both platforms

**When:** with this release. The device proof is native code
(`apps/mobile/modules/device-proof`), so it reaches people only in a store
build: `pnpm release build production` and
`pnpm release build production --android`, then TestFlight as usual.

### 5. Turn the check on

**When:** once both store builds are available in TestFlight and Play
internal testing, and steps 2 and 3 are done.

```sh
npx convex env remove --prod SIGN_UP_DEVICE_CHECK
```

(Unset means on in production.) People on older binaries who try to
create an account are told to update Vera.

**Verify:** on Shawn's iPhone with the new TestFlight build, create an
account (it works: phones aren't counted for accounts made before this),
then try a second: "This phone already has a Vera account." Check the
same on his Android phone with the Play build. For later test accounts,
let a username past for a day:

```sh
npx convex run --prod signUpDevices:allow '{"username":"<name>"}'
```

If sign-ups fail for everyone, `npx convex logs --prod` shows why
("sign-up refused: …"); `SIGN_UP_DEVICE_CHECK=off` turns it back off.
