# Private production feedback, October 25

Shawn requests three follow-ups after testing the joint private production
builds from079b9a64. Existing phone passes for send/growth, keyboard/menu,
viewer, real-content lift and gestures remain acceptance constraints. These
new requests are not permission to merge, deploy production or distribute new
private/store builds. No additional numbered phone pass is inferred.

## Scope and source findings before implementation

1. Suppress device reaction notifications for the foreground conversation,
   including old offscreen messages, while retaining Activity entries.
   `features/notifications/push.ts` already records focused conversation IDs
   and filters presentation. Ordinary reaction payloads include the root
   conversation ID; only thread-only reactions include data.threadId. The
   thread branch currently bypasses the active-conversation comparison. That
   is a concrete narrower gap, not proof of Shawn's root-channel report.
   Reproduce actual payload/focus/presentation behavior before selecting the
   correction. Keep other-chat and background delivery, account boundaries
   and server Activity records. Prefer an app-only fix; no backend edit is
   currently justified.
2. Center an Activity target in the usable viewport including composer and
   keyboard, bounded by available content. Activity passes messageId into the
   anchored window and native initialRowId. iOS already computes a center
   from adjusted insets. Android centers initial indices greater than zero,
   excluding target zero; both implementations can be constrained by bounds.
   Trace effective anchor identity, initial placement and late geometry in
   actual clients before editing shared routing or native formulas. No native
   change or build is selected yet. If a native defect is established, notify
   parent before compilation; existing clients can test only compatible JS.
3. Move Native Message List into the existing Experimental section at the
   bottom of Settings, visible to production users. Make the unchosen default
   on, retaining persisted explicit off and the nativeListInstalled guard for
   old binaries. Existing vera.nativeList SecureStore persistence is reused.
   Remove About/Testing duplication; no new native/API/backend requirement.

## Bounded verification

Use existing dev-client binaries and Metro8492 first. Capture Settings before
and after on both platforms, toggle off/on and relaunch to prove persistence
and RN fallback. Exercise ordinary and thread reaction presentation while the
same conversation is foreground, a different conversation is foreground, and
the app is backgrounded. Inspect real focus/payload decisions without message
content or secret data; preserve Activity rows independently. Where simulator
push transport is unavailable, distinguish handler/local-presentation checks
from actual remote-device acceptance.

For Activity, use one older target with surrounding rows and one bounded edge
target, record its identity/rectangle against usable top and composer/keyboard
top. Check both layouts/platforms and RN fallback only for the affected route.
No full motion suite, benchmark matrix, burst seed or cold profile. Run focused
regressions and required ordered repository validation. Devices start only
through sim.sh/queue, native checks use the shared heavy lock, and devices go
down when idle. Keep Metro8492 available. Build no new private/store artifact
until these follow-ups are verified and the user asks for that stage.

## Implemented and verified

All changes are shared JavaScript. No native source, contract fields, backend
code, dependency or binary changed. Existing phone Dev clients897820a3 and
9b068434 support the methods/features used here. The private production IPA11
and APK8 remain their previous079b9a64 source and do not contain this feedback.

Reaction presentation now uses account-scoped foreground chat, thread and
reaction-sheet contexts. Sheet context is separate from the routing root.
Reactions in the same conversation are suppressed before the thread branch;
other chats/accounts and background still notify. Activity/server writes are
untouched. Before, the actual iOS bare root rejected an injected reaction, but
opening its real reactor sheet cleared root focus and accepted the same push.
This proves that overlay gap, not every bare physical-channel report. The
short-lived opt-in trace used to record that decision is completely removed.

After, iOS OS-injected Expo-shaped aps+body notifications yield presented[] in
the bare root and reactor sheet, one notification for another chat and one
for the same chat while Vera is backgrounded behind iOS Settings. Android local
Expo notifications similarly yield zero in the current chat, one in another.
These are injected/local presentation checks, not physical APNs/FCM delivery.
The pure policy tests cover foreground/background/thread/other-account and the
unchanged Inbox/Activity distinctions. Existing Activity rows remain visible.

Activity root targets had correct IDs and loaded rows, but initial placement
left Testing at y765 under the iOS composer beginning at798. The existing
native scrollToRow(false) command centers it correctly after readiness. Shared
readiness now invokes that command once before fading the cover, with duplicate,
stale-view/detach, missing-target and rejection guards. It does not retry on a
timer or recenter on reactions/typing. Both layouts/platforms show the target
centered, or constrained by available newer content. iOS whole-row midpoint470
matches usable midpoint472; the near-latest Activity target is bounded with
newest content ending8pt above the bar. Android index-zero/latest ends at its
existing content bound, above the composer. The compiled callback ref remains
identical after an unrelated reaction update, with the row rectangle unchanged.

An actual Activity reaction-row tap is recorded on both platforms. The existing
native command is also exercised with the keyboard visible on each platform;
it uses the reduced usable viewport. This is separate from initial navigation,
which dismissed the keyboard before the sampled screen opened. No claim of a
keyboard-visible initial-navigation sample or automatic recentering after later
keyboard changes is made.

Thread Activity had another shared omission: thread-only targets lost their
message ID, and the window always opened latest. Grouped thread entries now use
item.latest; reaction/mention/reply entries use their message. The route carries
messageId plus finite targetSentAt, and the thread opens with existing strict
before(sentAt+1)/after(sentAt-1) queries. Its unique opened identity retains the
anchor, merges duplicate IDs, includes the root once, and uses existing manual
older/newer pagination and following. Ordinary threads stay unchanged. No new
backend operation, around argument, hydration layer or loading loop is added.

Accepted timestamp-protocol limit: two50-row pages cannot guarantee an exact
ID if more than100 different replies share one sentAt. Missing targets reveal
the existing bounded fallback, without asserting a successful center. Tests
cover target70 in250 replies, ordinary timestamp ties, deduplication, manual
older/newer paging to live and invalid-time fallback. Actual runtime uses the
existing own Mixed media rootc7e7abc8, with16 replies. Normal no-anchor opening
works. Targeta128e2cf appears once, root once, in20 native rows; its displayed
rectangle944..1548px is centered within the padded usable region. The >50 case
is model evidence, not invented runtime history. One metadata-selected fixture
for a different account returned CONVERSATION_NOT_FOUND and is discarded. A
single bounded metadata read then selected the known own thread; no seed or
extra workload was created.

Settings → Experimental now has the only Native Message List switch. It is
production-visible on compatible binaries, defaults on, and reuses the existing
SecureStore key without overwriting an explicit off. About/conversation Testing
and Developer duplicates are removed. Actual native switches on both platforms
turn it off; the choice survives process relaunch, and devList.kind reports rn
in the mounted fallback. Both return to native after restoring on. Production
visibility/default are source-checked because no new production build is made.
Older binaries keep the unchanged nativeListInstalled fallback.

Focused tests:23 pass across presentation, initial command lifetime, Activity
routing and the existing window-model suite. Required lint, typecheck, test,
React Doctor against origin/t3/native-message-list and format pass. No full
motion suite, benchmark, burst seed, cold profile, native build, backend push,
private/store build or release is run. An existing Android startup React warning
is retained and dismissed before interaction, not counted as an error-free run.
Both devices and panels are down; Metro8492 remains normal and available.

## Existing-client handoff

phone.sh link correctly refuses the current fingerprint because no current
physical Dev installer is cached. phone.sh up would build one and is NOT run.
No fingerprint alias or install metadata is changed. Reuse the previously
printed open/address block only after checking its current LAN address,
Metro8492 status/normal development configuration and hosted open page. Existing
897820a3/9b068434 Dev clients are compatible with these JS changes; no reinstall
is required. Production Vera stays alongside Vera Dev and is untouched.

Phone checks, only these three:

1. From another account, react to an old offscreen message while this chat is
   foreground, then with its reactor sheet open. No device notification; the
   Activity entry remains. Another-chat and background controls must notify.
2. Tap Activity reaction/mention and thread entries. The indicated root message
   or reply should be centered in usable space, or as close as bounds permit.
3. Settings → Experimental → Native Message List: off, relaunch, confirm RN
   fallback; on, confirm native. Explicit off must remain off until changed.

Real remote-device presentation remains Shawn's acceptance. No merge, public
release, store/OTA action, production deploy or data pass is authorized here.

Live handoff verification is complete. The original, unmodified phone.sh
address/links/open_url definitions are invoked with the REAL prior897820a3
CLIENT_DIR, without dispatching ensure_client. They print10.0.0.124:8492, which
is still the active default Ethernet interface, not a stale address. The Wi-Fi
interface also has10.0.0.152; no interface selection or product helper is changed.
The printed open page returns200, the selected server reports running and its
manifest is Vera Dev/chat.vera.app.dev. Metro command is normal dev-client mode,
without no-dev/minify profiling flags. No cache alias, installer metadata,
private artifact or binary was changed. Tailscale remains off.

Uploaded evidence is under
https://vera-evidence.b-cdn.net/pr/t3-native-message-list-integration/20261025-131517-eab03a5e/.
It includes root target before/after, both Settings screens, both current-keyboard
command samples, the actual thread target, and short real Activity-tap clips on
each platform. Raw metadata and checks are in `.cache/private-feedback-20261025/`.
