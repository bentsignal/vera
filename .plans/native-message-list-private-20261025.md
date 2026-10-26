# Private production phone test, October 25

Shawn explicitly authorized these two branch builds for his phones only after
the small stacked body-reaction placement fix. This is not approval to merge,
release publicly, submit to stores, publish OTA updates, deploy the backend or
run the data pass. Vera Dev and Metro8492 remain available separately.

## Verified installers

- [Install private Vera on iPhone, build 11](https://vera-evidence.b-cdn.net/preview/ios/20261025-079b9a64-a0f7c135cd8f/index.html)
- [Install private Vera on Android, build 8](https://vera-evidence.b-cdn.net/preview/android/20261025-079b9a64-634458744972/index.html)

Both artifacts were built from `079b9a64049a8c5c9f22273747067465a79fbbd5`.
That source has all nine CI checks green. This report is a later documentation
change, not the source embedded in either artifact. iOS built at15:12–15:21Z;
Android at15:24–15:33Z. Hosted verification finished at15:36:06Z.

| Artifact | Embedded runtime | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| ios | `251eec9a9649c31d0eec62ca3696fc6e76ee8b26` | 56,966,763 | `5b388255f2f98179151c81fe924ea9191d90796439972fd386a12c4cbf1133b2` |
| android | `915059605e584f9f12b947e451c05f3a3734956f` | 125,641,758 | `1a63374b49648b2781c820eea1aaf7421ef063ce5433209e468f4203340ebc91` |

Both are production Vera, `chat.vera.app`, Release, configured home `vera.chat`
and channel `preview`. iOS strict codesign, ad-hoc registered devices,
production push entitlement, application ID, team and effective keychain group
are checked against the current store build9 archive. Android apksigner,
non-debuggable manifest, package, preview request header, current production
assetlinks and passkey origin are checked. Both embedded fingerprint files
match the prebuild production fingerprint. Hosted pages and iOS manifest return
200; complete downloaded IPA/APK hashes and byte counts match the local files.

The build wrapper unsets APP_VARIANT, EXPO_PUBLIC_PROFILE_BUNDLE and
VERA_METRO_PROFILE, sets EXPO_PUBLIC_VERA_DOMAIN=vera.chat and EXPO_NO_DOTENV=1,
and records the allowlisted values. EAS reports no remote production environment
overrides and only the expected preview-profile home/extension values. Hermes
bytecode confirms profileBundle=false. Both bundles contain zero instances of
THIS isolated hostname/account domain. Each retains one generic dev.vera.chat
classifier literal; it is not the selected endpoint, and its presence is
explicitly accepted. No build-only strip, environment rewrite or dependency
change was made. Production compatibility and optional-query fallback are
recorded in the main plan; the required gate remains off, and no backend was
deployed. Preview excludes the gate and its live update branch is empty.

## Install and return safely

On iPhone, install over Vera without deleting it. Verified application ID,
team and effective keychain match preserve its app container and sign-in.
Return by reinstalling TestFlight over it without deleting.

On Android, the actual EAS production signer is
`E6:A1:C5:45:24:F8:8C:7B:57:A9:66:9F:DF:D5:23:0B:5A:86:83:8F:F3:16:E1:1C:F7:A1:95:E3:B2:10:44:5F`.
Google Play uses
`69:B5:52:E7:C5:0D:AE:70:C8:5B:7C:8C:D1:98:B3:B7:D2:FF:81:E5:B5:28:36:5A:C4:3B:03:6F:35:EC:BB:EE`.
If the installed Vera is from Play, uninstall it first, install this APK and
sign in again. Uninstall removes local sign-in, drafts, unsent messages and
cache; server messages remain. An earlier E6-signed private APK can update in
place. The physical phone's installed signer was not inspected. Returning to
Play requires uninstalling this private APK, reinstalling Play and signing in.
Vera Dev is a separate app and remains untouched.

Native defaults on in preview. Its comparison switch is conversation info →
Testing → Native Message List, or More → About → Testing.

## Short phone acceptance

1. Stacked text plus photo/carousel: message 👍/👎 directly under text before
   media, photo ❤️ under its own photo, each tap changes only its own part.
2. Force-quit/reopen and open the real busy group cold, then reopen it. This
   standalone production configuration removes the Metro connection delay;
   actual phone first-open acceptance remains pending.
3. Galaxy A16: composer Camera → selfie → OK → rounded staged preview → send →
   reopen conversation/photo without a crash. This is mandatory before public
   release. No camera fix or memory-pressure cause is claimed.

The tiny placement change passed focused native330/130 checks, iOS SDK23,
ordered repository checks and before/after screenshots plus one brief exact-part
reaction recording per platform. Bubbles, per-media targets and no-text trailing
placement are unchanged. No new benchmark, firehose, burst or cold profile was
run. Earlier explicit phone passes remain recorded; check13 is not invented.

Raw verification, public build flags, environment proof, local/remote hashes
and build logs are in `.cache/private-production-20261025/`. The complete
bounded placement evidence is linked in PR284. Own devices are down and the
heavy lock is released. No further work is planned until phone feedback.
