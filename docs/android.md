# Android

Status and plan for getting Vera onto Android, written 2026-10-03. Shawn's
friends test iOS builds through TestFlight; at least one friend uses an
Android phone and should be able to join the group chat as soon as possible.

These findings come from reading the code, EAS, Convex, and this Mac. Nobody
has run the app on Android yet, so the UI gaps below are expected problems,
not confirmed ones. The first step is to run it and replace guesses with
screenshots.

## Current state

- EAS has exactly two Android builds, both `development` (dev client) from
  2026-10-02: one errored, one finished. No `internal`, `preview`, or
  `production` Android build exists.
- `app.config.ts` already has the Android package `chat.vera.app`, adaptive
  icons, and predictive back.
- `eas.json`: `production` (the store profile; `preview` was folded into it)
  sets `android.buildType: "app-bundle"`; `internal` has no Android settings.
- No Firebase project, `google-services.json`, or FCM key, so Android push
  does not work yet.
- No Google Play Console account yet.

## App code

### Already cross-platform

- 28 files import the universal `@expo/ui` entry (`FieldGroup`, `Text`,
  `Button`, `ListItem`, `TextInput`, `Row`, `Switch`, `Picker`, and others).
  It renders SwiftUI on iOS and Jetpack Compose on Android, so most forms and
  settings screens should already come out as Compose.
- Only `src/lib/ui-modifiers.ios.ts` and `src/features/settings/themes-section.tsx`
  import `@expo/ui/swift-ui` directly. `src/lib/ui-modifiers.android.ts`
  holds Compose modifier presets.
- Every `SymbolIcon` passes `{ ios, android }` names (SF Symbols and Material
  Symbols); the tab bar sets `md=` icons on every `NativeTabs.Trigger`.
- `src/components/action-sheet.ts` falls back to `Alert.alert` on Android.
- `src/features/notifications/push.ts` creates the `messages` Android
  notification channel.

### Expected gaps

| Area                  | Files                                                                              | Expected problem on Android                                                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Liquid Glass surfaces | `features/conversation/composer.tsx`, `reaction-chips.tsx`, `glass-menu-parts.tsx` | `GlassView` from `expo-glass-effect` is a plain `View` off iOS 26+, so these surfaces have no background (the composer may float with nothing behind it) |
| Message menu backdrop | `features/conversation/glass-message-menu.tsx`                                     | Uses `expo-blur` `BlurView`; Android blur looks different and may be a tint only                                                                         |
| Conversation header   | `features/conversation/conversation-header.tsx`                                    | Built around the Dynamic Island with floating glass buttons; `TopEdge` returns `null` off iOS                                                            |
| Transparent headers   | `components/tab-stack.tsx`, `app/(app)/_layout.tsx`                                | `headerTransparent` is iOS-only; check Android headers and insets                                                                                        |
| Search tab            | `app/(app)/(tabs)/_layout.tsx`, `features/search/native-search.ts`                 | `role="search"` and the iOS 27 `react-native-screens` patch are iOS-only; on Android it is an ordinary tab, so check that the search field still shows   |
| Themes                | `features/settings/themes-section.tsx`                                             | Returns plain children off iOS                                                                                                                           |
| Message notifications | `plugins/notification-service/`                                                    | The communication-notification extension is iOS-only; Android shows plain notifications                                                                  |

### Platform files

Use `.ios.tsx` / `.android.tsx` only where the design actually differs
(composer, conversation header, message menu, reaction chips). Inside the
Android files, use `@expo/ui/jetpack-compose` directly for Material 3 pieces
such as bottom sheets and dropdown menus. Keep data hooks and screen logic
shared, and do not fork whole screens. Platform files are new files, so they
rarely conflict with feature work happening on the shared screens.

## Push notifications

Expo push on Android goes through Firebase Cloud Messaging. To set it up:

1. Create a Firebase project (Shawn's Google account) and add an Android app
   with package `chat.vera.app`.
2. Add the `google-services.json` file and point `android.googleServicesFile`
   at it in `app.config.ts`. The file holds only public identifiers and is
   normally committed.
3. Create a service account key for FCM V1 and upload it to EAS
   (`eas credentials -p android` → Google Service Account → FCM V1). Keep the
   JSON key out of the repo.
4. Rebuild; `getExpoPushTokenAsync` then works on Android, and the backend's
   Expo push sender needs no change.

Later: Android's equivalent of the iOS communication notifications is
`MessagingStyle` with a person icon per sender. It needs native work and can
wait until plain pushes work.

## Passkeys

Verified 2026-10-03:

- `https://vera.chat/.well-known/assetlinks.json` lists `chat.vera.app` with
  the fingerprint `E6:A1:C5:45:…:44:5F`.
- Production and dev Convex have the same `PASSKEY_ANDROID_PACKAGE`,
  `PASSKEY_ANDROID_CERT_SHA256`, and `PASSKEY_ORIGINS`
  (`https://vera.chat,android:apk-key-hash:5qHFRST4jHtXqWaf39UjC1qGg4_zFuEc96GV47IQRF8`).
  The `apk-key-hash` is the base64url form of the same `E6:A1` fingerprint.

So any build signed with that key should pass passkeys. Confirm the key is
EAS's Android keystore for `chat.vera.app` (`eas credentials -p android`
from `apps/mobile`).

Other signing keys need both values added, on both deployments:

- **Google Play App Signing** re-signs Play builds with Google's key. Copy its
  SHA-256 from Play Console → Test and release → App integrity, then add it
  to `PASSKEY_ANDROID_CERT_SHA256` and its `android:apk-key-hash:` form to
  `PASSKEY_ORIGINS`.
- **Local debug builds** (`expo run:android`) sign with
  `~/.android/debug.keystore`, which does not exist yet. Rather than trusting
  that key, sign emulators in with the dev deep link:
  `adb shell am start -a android.intent.action.VIEW -d "vera:///dev-sign-in?username=androidtest"`.

Passkeys on an emulator need a Google account signed in and a screen lock
set. Both existing AVDs use Google Play system images, which include Google
Play services (also needed for FCM).

## Getting builds to Android testers

Two routes; run them in parallel.

### APK link (fastest)

EAS builds a signed APK and gives a link; the tester allows "install unknown
apps" and installs it. No Google account is needed, and it is signed with
the EAS key that `assetlinks.json` already lists.

- Add an Android profile that targets production (`vera.chat`, like
  `production`) with `android.buildType: "apk"` and `distribution: "internal"`,
  so the friend joins the same server as the TestFlight group. Set
  `buildType: "apk"` on `internal` too, for Shawn's own Android testing
  against `dev.vera.chat`.
- Every update means sending a new link.
- Google's developer verification for sideloaded apps started enforcement on
  2026-09-30 in Brazil, Indonesia, Singapore, and Thailand only, and goes
  global in 2027. Check where the friend lives before relying on this route.

### Google Play internal testing (the TestFlight equivalent)

1. Shawn creates a Google Play developer account ($25 once, government ID
   check, may take days).
2. Create the app in Play Console with package `chat.vera.app`.
3. Upload the first `.aab` by hand in Play Console; Google requires a manual
   first upload before the API can publish.
4. Create a service account with Play Console access, store its key with EAS,
   and add `submit.production.android` to `eas.json` (track `internal`). After
   that, `eas submit -p android` publishes.
5. Add testers by email (up to 100). Internal testing has no review, and
   updates arrive through the Play Store.
6. Add the Play App Signing fingerprint to the passkey variables (see
   Passkeys).

Personal accounts created after 2023-11-13 must run a closed test with 12
testers for 14 days before public release. That only matters for the store
launch, not internal testing.

## Mac and T3 Code simulator support

Shawn works in T3 Code, whose device panel runs simulators for agents.
**Android emulators must work in T3 Code, the same way iOS already does.**
The task is not done until they do.

State on 2026-10-03:

- Installed: Android Studio, SDK platforms 33/35/36, platform-tools (`adb` on
  `PATH`), emulator, NDK, and JDK 17 and 21 (`JAVA_HOME` is Zulu 21).
- AVDs: `Pixel_9` and `Medium_Phone_API_36.1` (Google Play images, API 36
  and 36.1).
- Missing (installed later that day, see Next steps): **Android SDK Command-line Tools** (`~/Library/Android/sdk/cmdline-tools`
  does not exist, so no `sdkmanager` or `avdmanager`) and the `ANDROID_HOME`
  variable.
- T3 Code's Settings → Simulator support shows iOS Ready and Android
  "Android SDK Command-line Tools (latest) are missing from
  /Users/shawn/Library/Android/sdk. Install them in Android Studio's SDK
  Manager." The `device_list` tool reports Android unavailable for the same
  reason (`avdmanager list avd` fails).

Fix:

1. Install the command-line tools into `cmdline-tools/latest`, either in
   Android Studio (Settings → Languages & Frameworks → Android SDK → SDK
   Tools → Android SDK Command-line Tools (latest)) or by unzipping Google's
   macOS command-line tools download there.
2. Add to `~/.zshrc`:
   `export ANDROID_HOME="$HOME/Library/Android/sdk"` and
   `export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH"`.
3. Restart T3 Code if it doesn't pick up the change, then press Refresh in
   Simulator support.
4. If Gradle rejects JDK 21, point `JAVA_HOME` at Zulu 17.

Done when:

- T3 Code's Simulator support shows Android Ready. Check the panel with
  computer use on Shawn's Mac, and tell Shawn before anything opens on his
  screen.
- `device_list` lists the Android AVDs as available.
- `device_open` boots one, the Vera app runs in it, and `device_screenshot`
  returns the app.

## Working notes

- Run `eas` from `apps/mobile`. From the repo root it fails with "EAS project
  not configured" and leaves a stub `app.json` behind.
- New worktrees have no `node_modules`; run `pnpm install` before `eas` or
  Expo commands, which load the config plugins.
- Local runs: `pnpm --filter @vera/mobile android` against `dev.vera.chat`.
- Keep Android work in small PRs separate from feature work. Most of it is
  new `.android.tsx` files, `app.config.ts`, and `eas.json`.

## Next steps

- [x] Install the command-line tools, set `ANDROID_HOME`, and confirm Android
      works in T3 Code (see above). Done 2026-10-03: T3 lists Android as
      available, and `scripts/sim.sh --android up` runs Vera in a per-worktree
      emulator that `device_open` streams (by its `emulator-55xx` serial).
- [x] Build the app for Android. The build failed until the splash screen got
      an Android-only transparent image (`expo-splash-screen` needs one).
- [ ] Screenshot every screen on the emulator against `dev.vera.chat`, and
      replace the "Expected gaps" table with confirmed issues.
- [ ] Set up Firebase and FCM V1 for push.
- [ ] Build the production APK (`pnpm release build production --android`,
      the `production-apk` profile), confirm the EAS keystore fingerprint,
      and send the friend a link.
- [ ] Fix the Android UI in small PRs: composer and glass surfaces, conversation
      header, message menu, search tab, themes.
- [ ] Once Shawn's Play account is approved: Play internal testing,
      `eas submit`, and the Play signing fingerprint for passkeys.
- [ ] Later: `MessagingStyle` notifications.

Open questions for Shawn: which country the Android friend is in, and the
Google account email to add as a Play tester.
