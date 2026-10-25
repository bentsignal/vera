# Ordinary composer growth: ownership proposal, October24

Status: agreed source is integrated; combined client compilation and mounted
runtime evidence are pending. Send ACK and both native freeze/latest paths
already pass Shawn's phones and remain constraints. Historical proposals below
record the decisions and objections; revision3 and the closing exception govern
the implementation.

## Evidence and failed smaller candidates

The iPhone first Return moves the field43.3 ms before the same newest row;
later Returns trail20 ms. Direct current-bar observation in the existing JS
onLayout callback reduces the first sample to20 ms but leaves later20 ms.
An earlier JS TextInput content-size callback still leaves11.7 ms on the first
Return and21.7 ms on the third. Raw original-frame trajectories are preserved
under .cache/round2/ios-newline-{before,after,content}-trajectory.json. The
content-size experiment is removed from product source because it does not
establish synchronization. Direct observation is retained as the fallback
notification path, with actual-hook send-gate tests.

Shawn reports100–200 ms lag on his physical A16. That is phone observation,
not a timestamped emulator measurement. Attachment removal also shows the
composer's220 ms height animation reaching the newest row in later steps.
Picker dismissal overlaps the add clip, so it cannot assign a stationary
add latency. None of these samples proves a minimum-height error.

Both native lists can apply an inset-only update immediately, but they cannot
apply an inset before JS sends it. Rows supplied in the same props update add
measurement/diff work. Need preserve actual rows identity and record that path
before blaming native worker time for ordinary growth. The React/JS round trip
remains even when rows are stable.

## Proposed bounded direction

Use a native UI-thread observation of the ACTUAL committed composer bar and one
native coordinator for its bottom inset. Do not add a competing animatedProps
writer, predict text height or poll while idle. Keep existing React insets for
older binaries and initial fallback; feature-gate the new path. This needs a
reviewed optional binding between one list and its own bar plus explicit send
hold/release identity. Names and transport are not selected yet.

The observer must run after the current mounting transaction has applied BOTH
layout and props, before presentation. Read the bar's actual height, excluding
keyboard translation. It must cover ordinary TextInput Yoga layout and the
existing Reanimated attachment height animation. Installed Fabric has mounting
transaction observers on iOS and UIManager mount listeners on Android; whether
Expo can safely subscribe and whether Reanimated attachment mounts trigger the
same callback are open source questions for native owners. A bar layout
listener may supplement transaction notifications, but it cannot publish before
its transaction's send-hold props are known. No frame timer or guessed delay is
an acknowledgement.

## Required ordering, one owner

1. Shared creates send sequence BEFORE clearing. In the render that can clear
   the field or remove staged files, its list binding already says HOLD that
   sequence. A post-mount observation must see the hold before it may publish
   the empty bar. Prove this commit order; do not assume cross-queue FIFO.
2. Native records actual bar observations while held but does not apply their
   height. The existing shared ACK, exact optimistic row, navigation readiness
   and freeze requirements remain the release authority.
3. Shared releases sequence + ACK inset + rows in one props update. Native
   retains ownership until that exact carried pair actually applies, including
   iOS frozen measurement retention and Android FIFO diff work. A subsequent
   ordinary height report cannot clear or supersede this rows dependency.
4. Only after the pair applies may ordinary UI height follow again. New draft
   growth during worker delay stays recorded and must reconcile once, against
   current geometry, without a stale React inset restoring an older height.
   Decide whether latest observed height co-applies or follows the paired move
   during source review; do not silently change the ACK meaning.
5. Ordinary height goes through existing native keyboard/freeze/anchor/latest
   handling. While lifted/frozen, hold it; thaw with current final geometry.
   No separate observer may move the lifted part's home or escape pending land.
6. Retained owner and sequence are scoped to this list/bar. Superseding send,
   cancellation, same-height sends, failed/restaged files, remount, detach and
   owner reuse need explicit resolution. No indefinitely hidden row, stale
   observer, global cross-conversation binding or elapsed-time release.
7. Older binaries keep the existing single React inset path. RN fallback keeps
   its current UI-thread room. The new binding must not make either read a new
   native method or assume a feature exists.

This is a small native coordination addition only if these invariants fit the
existing module cleanly. If it needs a new native wrapper or mounting bridge,
return its exact scope/API and compatibility cost before implementation. No
broad composer rewrite is authorized by this proposal.

## Acceptance before both next Dev clients

Track physical field border, bar top and the SAME newest row through newline,
backspace, wrapping and attachment add/remove, both layouts and both platforms.
Keep keyboard stationary for height comparison; separately exercise keyboard
open/close and freeze/lift. Check large font and placeholder. Preserve normal
and deliberately delayed-UI send ACK, concurrent arrivals, same-height sends,
scrolled-up smooth latest and final8pt gap. Show actual timing/identity evidence;
JS/native/video clocks stay separate. Formal motion failures remain reported.

The latest product decision removes inline message double-tap menu arbitration
and keeps fullscreen zoom. Both next updated Dev clients are delivered together
only after the remaining bugs pass. Private production/camera testing follows
later, with no merge, release, OTA or data pass in this work.

## Revision2: concrete host proposal for review before implementation

Both native reviews confirm the post-mount mechanism and attachment-height
mount path. Android can subscribe directly to UIManagerListener.didMountItems.
iOS needs a component-specific ObjC++ mounting bridge registered on Expo's
adapter class BEFORE Fabric caches its selector flags. This is a real bridge
and podspec scope cost. A Swift method on the list alone is insufficient.
Neither owner has implemented a height change.

Propose a small optional MessageListComposer native view around ONLY the
existing Bar, leaving the current measured Animated.View, text input, layout,
send ACK and styles inside it. The wrapper has no drawing, no padding and no
height animation. Its mounted bounds must equal the current bar's height.
Its metadata is {owner, sequence}, rendered in Composer itself. That component
already reads the send store through useComposerCommit and owns the cleared
text. A controlled clear changes React text state, not imperative TextInput
clear; the latter is only the already-empty autocorrection rejection path.
The new wrapper's sequence must be in EVERY commit that clears that field or
its attachment strip, so post-mount sees the new sequence even if list props
have not caught up. Verify this with real mount logs and delayed-layout cases.
If it cannot be proved, stop rather than infer JS/UI FIFO.

The list gets one optional composer binding {owner, release}. Owner matches
only a live wrapper in the same surface, held weakly. Release is the latest
send sequence whose existing JS ACK/exact-row/navigation/freeze requirements
have passed. It is supplied WITH the corresponding rows and ACK inset. There
is no new async HOLD command or native acknowledgement back to JS.

Native observer states are ordinary, held(sequence), released-awaiting-apply,
and landing/frozen. A mounted wrapper sequence newer than the list's applied
sequence holds ordinary height immediately. The release prop binds that
sequence to the actual rows apply version/generation. A stale completion never
unholds a later sequence. A release cannot apply before its matching mounted
host sequence is known; initial, same-height and canceled sends use the same
explicit release, not a timeout. Android retains all FIFO diffs. Older binaries
and RN fallback mount the existing Bar directly and use the current React path.

Recommended reconciliation policy, requiring agreement: at matching paired
apply use the latest valid ACTUAL mounted wrapper height once with the rows.
The shared scalar ACK continues proving that this send's clear committed; it
is permission to release, not a lock against a later draft's actual geometry.
This avoids ACK-height followed by another ordinary-height move when new
text or restaged media arrived during worker delay. While bound, stale React
bottom insets cannot replace the native observed value; top and keyboardOverlap
remain React-owned. No standalone observation enters InsetsGate/InsetHold while
the pair is pending. Missing/unmounted hosts and owner replacement invalidate
cached measurements and require an explicit fallback/lifecycle transition.

The coordinator also holds ordinary measurements through real-view LANDING
completion, not merely lift=null or rowId=nil. Add a narrow internal completion
hook/token guarded for owner, newer lift and detach. Pair/freeze thaw computes
final geometry before existing pending land starts. No-barrier landing keeps
its current path. User scroll/anchor/latest behavior uses the existing paths.

Concrete proposed scope is shared optional feature/view/prop types and host
placement; one module-local native host/coordinator each; iOS component-specific
ObjC++ adapter bridge and podspec source inclusion; Android mount listener;
existing inset/apply/freeze integration and landing completion lifetime; focused
state/order/lifecycle tests plus combined physical trajectory QA. No dependency
upgrade, predicted size, polling, timer, new keyboard policy or send redesign.
This is the architecture/contract review boundary. No implementation until its
transport/order, reconciliation and bridge scope are accepted.

## Revision3: exact optional contract and edge rules for mutual agreement

This supersedes revision2 where they differ. Parent accepted the bounded scope
and actual-height reconciliation in principle. Both native source reviews are
complete. Implementation waits for agreement to these concrete refinements.

- Native support feature: `composerLayout`.
- Optional named view: `MessageListComposer`. Props `owner: string`,
  `sequence: number`, normal style and children. It is a retained, transparent,
  ordinary Yoga container around Bar ONLY. Existing inner Bar ref and ACK stay.
  No flex:1, fixed height, padding, accessibility grouping or native size setter.
  Shared uses the CURRENT snapshot returned by useComposerCommit in Composer,
  never only parent report.sends. Bounds must match Bar at zero child origin.
- Optional list prop: `composer: { owner: string; release: number; gap: number }`.
  `gap` is explicitly COMPOSER_GAP, currently8 logical points. Bound native
  bottom is actual wrapper height + gap EXACTLY ONCE, then the existing keyboard
  overlap calculation. Never infer a gap from ACK minus actual height or copy
  a native magic8. React continues owning top and keyboardOverlap.
- `release` is a PERSISTENT latest authorized local send sequence. Add released
  sequence to shared InsetState: initial0, updated only by acknowledged release,
  retained while a newer send waits. Same-store remount replays a published
  sequence; an unpublished send still waits. Existing ACK/exact-ID/navigation/
  freeze prerequisites are unchanged. Cancellation uses that same explicit
  release path; there is no native cancel-to-unhold shortcut.

Post-mount seal: binding props/setters alone never authorize an immediate apply.
All mutations on the surface must finish before reading actual wrapper props
and bounds together. iOS bridge therefore covers ONLY the named Composer AND
this module's default list adapters, prepared before selector-cache registration.
Either callback may coordinate current owner; order and duplicate notifications
must not matter. No category on Expo's global base class, global swizzle or RN
patch. Android didMountItems, not idle didDispatchMountItems. Even first placement
or empty-list synchronous measurement must retain its result until the current
mount transaction seal. Worker applies between transactions use a valid sealed
sample. Read latest metadata directly, not an observer-order dependent cache.

Per-result authority: carry the authorized release and owner/binding generation
through the actual rows result. An older result cannot borrow a newer release's
height. Native state is keyed by owner plus native list/host lifetime generation.
Same-height/cancel release with unchanged rows creates an explicit native apply
barrier behind already-submitted work. Android keeps its FIFO worker chain and
uses a no-change result/barrier, not a dropped diff or a request to wait for a
future nonexistent row. iOS may retain its current latest-full-result policy.

Rapid-send rule: if authorized S applies after wrapper sequence T>S mounted,
finish S's rows in platform order using its captured React paired inset/valid
S-scoped geometry. Do NOT use T's measured height, wait for host to become S
again, clear T's hold or mark T applied. T remains held until its own authorized
release/apply. Current actual geometry co-applies once only when host sequence
matches that result's authorized release. Within that sequence, a newer draft
or restaged files may change the actual height; ACK remains clear-readiness
permission rather than a lock to its old scalar. iOS supersession can combine
into T only through its existing current-full-result rules. Android cannot drop S.

Explicit fallback: after a COMPLETE mount transaction, an absent/detached,
ambiguous or wrong-surface host invalidates the bound sample. Never read another
owner/window or reuse its cached height. Enter legacy mode for that list/binding
generation, applying an authorized release with its captured React inset through
the EXISTING native barrier rather than hiding its row indefinitely. Keep current
applied geometry while transitioning; do not replay an arbitrary stale bottom
setter merely because a weak reference vanished. A later valid host establishes
a fresh bound lifetime from current native applied release and measured geometry;
old callbacks/results cannot rebind it. Duplicate live owners are invalid. Owner
change or sequence regression invalidates the old lifetime and uses explicit
legacy/rebind handling, never resets an old applied release silently. Shared
binding nil explicitly returns bottom ownership to React. Old binaries never
mount the host or send the prop.

Freeze/landing: buffer ordinary observations without touching InsetsGate/InsetHold
while a pair, freeze or actual landing owns geometry. Resolve final geometry
before a deferred landing captures its destination. A landing token remains
active through real-view restoration/frame handback, not just animation end or
lift=null. Completion/cancel guarded by owner, newer lift, detach and generation.
No-barrier landing keeps its behavior. Neither a prop setter nor post-mount sample
can restart an interrupted generic latest navigation.

Runtime proof must include React TextInput's own useLayoutEffect native
setTextAndSelection and later attributed-state mount, not assume controlled text
never uses native commands. Log actual host sequence/height at complete mounts
and native pair applies, plus the existing shared identity/ACK timeline, keeping
clocks separate. Include autocorrection rejection clear, coalesced rapid sends,
release-only cancel/same-height, remount/missing-host fallback and900 ms deliberate
actual-UI stall. Source feasibility and unit tests alone do not clear growth.

### Shared source checkpoint

Both native owners accepted the exact frozen revision3. Parent authorized its
bounded implementation. Contract/view exports are9affdc9e. Shared now mounts
ComposerLayout only for native-list selection and binaries with composerLayout;
legacy binaries and RN fallback retain the original Bar. useComposerCommit
returns its CURRENT external-store snapshot to Composer. Both native host
sequence and the empty-attachment-strip key use that snapshot, covering a
child-local clear even when parent report.sends is stale. The original inner
bar ref supplies the existing ACK as before.

InsetState now keeps persistent released authority, unchanged through a newer
held send or ordinary geometry. Published remount replays authority; unpublished
ACK does not. The same COMPOSER_GAP constant supplies React bottom and the
explicit bound gap. The opt-in JS trace records release separately from send
sequence without supplying any product height.

Shared ordered lint/typecheck/test/React Doctor against PR base and format pass.
Nineteen inset-state tests pass; actual compiled UI/hook tests include fallback,
explicit gap, stale-parent child-local clear, navigation and generic-observation
send guards. Root Jest totals23 tests across7 suites, all pass. These prove
shared state/render behavior, not physical mounted ordering or same-frame growth.
Native source, real combined compile and trajectory/send/lift evidence remain.

### Newly found paired-close cycle: policy proposal before code

Android landLift keeps the Modal until the actual source frame handback. A
released pair can become frozen before worker finish. Deferring its landing
until thaw then creates a cycle: shared onClosed requests keyboard return only
AFTER landLift resolves, while land waits for that return/thaw. iOS does not
await landLift, so it has no matching Promise cycle, but retains delayed land.
Moving focus to onClosing alone is not a source guarantee: Android's underlying
EditText lacks window focus while the Dialog remains focusable. No early-focus,
window flag, timer or native force-thaw change is selected or implemented.

Preferred bounded proposal for parent/native review: once a CLOSE is explicitly
requested, allow ONLY an already-authorized released pair to complete against
the STILL-FROZEN keyboard geometry, then capture destination/start real land.
If its worker result is not ready, retain pending land and perform the same
flush when it finishes. Do not set keyboardFrozen=false, follow the currently
hidden keyboard, restore source-window focus, or unhold an unauthorized newer
host sequence. Normal frozen/no-pair land remains immediate as before. The
existing shared onClosed then restores the keyboard after actual handback; its
return to the held height should leave no keyboard-down intermediate home.

This is an explicit narrow exception to revision3's strict frozen-pair barrier
at closing, not a silent reinterpretation of it. It keeps the existing IME/window
ownership and avoids adding a Dialog focus policy. Both platform owners and
parent must agree before code. Tests must cover close before/after worker,
post-mount seal, olderS/newerT, stale release, refreeze/new lift/detach, and no
pair/unreleased-host close. Runtime must retain raised home, continuous landing,
keyboard return and final8pt. No contract field or timer is proposed.

Parent and BOTH native owners now accept the closing-only exception above.
Implementation is authorized within the same bounded native scope. Apply uses
APPLIED frozen keyboard offset at both completion and paired layout, never the
hidden root's current keyboard height. Capture owner/release/result generation
and close token when close begins; a later callback cannot widen authority.
Invalidate obsolete close/landing work on new lift, refreeze, owner change or
detach, resolving canceled handoffs so a Modal cannot remain indefinitely. No
ordinary geometry flush, native thaw, latest restart or new field is authorized.
State/source checks are necessary; actual Modal/worker/raised-home/8pt runtime
checks remain required before delivery, including normal unpaired close.

### Bounded paired-close runtime fixture

Use the existing `/dev-native-list?composer=1` screen with made-up local rows,
the same native host/binding props and the actual RN Modal. One action releases
a changed row and shorter bar while frozen and removes the lift in that SAME
props batch. Native commit requests landing before submitting that batch's
worker, so traces can establish the close-before-worker case without a worker
timer or new native diagnostic command. A second action releases the pair while
the menu stays open, then closes only after the trace shows its retained result.
The Modal waits for the actual landLift handback; the existing keyboard-hold
hook requests keyboard return afterward. Native traces must establish which
ordering occurred, with no source-only runtime claim.

This fixture supplements normal real-app holds, source-frame handback and the
final8pt gap. It does not send a message, seed the backend, alter production
release behavior or replace ordinary newline/attachment trajectory checks.

Native checkpoints5c4f9ba4 iOS and14f57836 Android are merged into integration.
Their314 compiled iOS host checks,23 Swift installed-SDK typecheck and ObjC++
syntax check, and113 Android native compile/tests passed. Shared ordered lint,
typecheck, test, React Doctor against PR base and format pass after integration.
Jest totals25 tests across8 suites, including two compiled fixture-render checks
for the same-batch pair/close and release-while-open paths. The binding helper
is separated from the component file to satisfy React Doctor without suppressions.
These checks do not establish actual mounted ordering, native adapter callback
delivery, continuous landing or synchronized growth. The first actual iOS
CocoaPods/client build is running with log
`.cache/round2/composer-ui-ios-build.log`; no new phone artifact is ready.

### First combined runtime evidence

Both real client builds completed with exit0. iOS fingerprint
`aebbd615d603d6543be59090a9aeec9d7db8a874` includes the actual Pod/Swift/ObjC++
bridge link. Android fingerprint is
`187f34f39a789855e9de423a45346a57aeaaf524`. Xcode printed unusual third-party
Swift "failed with exit code0" diagnostics but ultimately completed successfully.
The first iOS loopback launcher retry timed out; selecting LAN8492 connected.
That discarded launcher attempt is not motion evidence. Normal phone8492 stays up.

Actual iOS Fabric callbacks validate the host as the sole equal-sized Bar child,
report `legacy=false`, and co-apply measured height plus exactly8. Real stacked
newline capture moves the SAME Jonah "Warm stacked arrival after typing" copy
from y455 to433,411,389 as field border497 becomes475,453,431. All three changes
occur in the same original recorded frames. The diagnostic-off repeat agrees at
PTS2.416667,4.055,5.723333 with template error below0.20. Before this change,
the corresponding captured steps trailed20–43ms. This is sample-bounded geometry
evidence, not a universal timing guarantee or smoothness pass.

Frame qualifications are retained: first diagnostic capture9slow/worst68.9ms,
CPU17%avg/24%peak; quiet repeat3slow/worst49ms, CPU24%avg/48%peak. No boot occurred.
The earlier before clip had6slow/worst49.3ms. These are not all-zero motion results.
Bubbles newline plus backspace shows all six22pt changes in the same recorded
frames, template error below0.44, but11slow/worst56.3ms, CPU16%avg/19%peak.

Picked `IMG_0111.heic` from the existing simulator library. Native mounted heights
progress from76 to148 with bottom height+8; no new seeded media was added. Picker
dismissal and file preparation overlap add, so its7slow/worst134.5ms and visible
geometry do not establish isolated asset-ready/add latency or a like-for-like
speed comparison. Stationary removal captures the full72pt collapse. Original
frames28,30,32,34,36,38,40 show named bubble text359→360→366→380→399→416→427→431;
the independently tracked glass border424→425→432→445→465→482→492→496 moves in
those SAME frames, within1px displacement. Full clip2slow/worst33.3ms,
CPU10%avg/peak, no boot. The original broad gray-band detector selected other
bubble edges mid-animation; its output remains saved. A finite original-PTS
contact confirms the same named copy, and the separate local glass-gradient
trace is preserved. No formal motion analyzer threshold or verdict changed.

Raw clips, trajectories, frame reports and mount logs are under
`.cache/round2/ios-ui-*` and `.cache/evidence/r2-ios-ui-*`. Pending are Android
trajectories, send900ms/rapid/supersession/fallback cases, actual paired-close
Modal/worker landing and remaining touched gesture checks. No fresh phone
artifact, delivery, private-production test or runtime-ready claim follows yet.

### iOS delayed clear and paired-close samples, 20:11 EDT

The real bubbles send `3145eeb4-7e66-4ea6-895a-019b6b698bc7` used the
strictly opt-in DEV UI-thread fault. Worklet timestamps record a 900.000125ms
physical UI stall. JS and native clocks remain separate. Native host sequence1
mounted height76 while release0 still held the old230 geometry; release1 then
applied bottom84 with the exact own optimistic row. The same pre-send Jonah
"Warm stacked arrival after typing" copy stays at y277, then moves monotonically
up to180 through PTS3.513333, with no recorded downward step. Later automatic
bot replies move the own message above the viewport. The final newest Priya
"haha yes" row ends at482 and the composer starts490, an8pt gap. This is one
bubbles boundary case, not all-send acceptance. Its deliberate907.8ms worst
frame is fault evidence, not a performance comparison.

The actual Modal fixture completed both orderings. Same-batch pair+close seals
release1 then applies `close=true`, bottom104, retained keyboard294. The later
case seals release2 at20:11:01.622 while the menu remains open and does not
apply it until close at20:11:03.648, with `close=true`, bottom168 and keyboard294.
Both return the focused input/keyboard, remove the Modal and settle at an8pt
gap: Pair1 row427..476/bar484; Pair2 row363..412/bar420. Finite sampled contacts
show the borrowed row returning continuously to the changed raised home, with
no whole-list drop to the hidden-keyboard bottom. These made-up local rows are
distinct from normal real-app hold evidence. iOS has no awaited `landLift`
feature, so fixture status alone is not a native restoration ACK.

Frame reports remain nonzero: before-worker close3slow/worst114ms, CPU17%avg/
21%peak; after-worker close4slow/worst150ms, CPU12%avg/14%peak. No boot overlapped.
The videos/raw AX/logs are `r2-ios-ui-modal-{before,after}-worker` under the local
evidence/round2 directories. No threshold changes or all-zero smoothness claim.

Existing iOS signposts establish actual worker ordering without a new probe:
release2 measurement finishes20:11:01.616; its apply stays blocked until close
at20:11:03.641. These are the same native clock domain. Add one local fixture
action before the next captures: stage a newer host sequence without authorizing
its release, then close the real Modal. It must take the normal no-pair close
path rather than wait for that unauthorized sequence. A bar action can explicitly
release the staged pair afterward to restore ordinary geometry. This is DEV
fixture coverage using existing props, with no native field, timer or product
policy change. A focused render test must show host sequence advances while
list release stays unchanged; actual Modal close remains the runtime proof.

### Remaining iOS finite cases, 20:25 EDT

The added fixture action/test passed ordered lint/typecheck/test/React Doctor/
format at22c9a893,26 Jest tests total. Actual unreleased host1/release0 closed
the Modal normally. No unauthorized height applied. Explicit release1 afterward
applied bottom104, with row427..476 and bar484, an8pt gap. Its2slow/worst134.4ms
and CPU14%avg/19%peak remain recorded.

The same fixture then retained authorized S=2 while mounting newer T=3. On close,
native applies release2/host3/bottom168/keyboard294, using captured S geometry
instead of T's96pt host. Only the later explicit release3 applies bottom104.
The Modal returns and the final gap is8pt. Capture4slow/worst142.2ms,
CPU14%avg/19%peak, no boot. This exercises S/T separation with a genuinely held
worker result, not only the coordinator unit cases. No source/native change
was needed after those captures.

Real-app clips also cover normal stacked8line send, short text from a tall
stacked composer, a bubbles8line send while scrolled up, and a same-height
bubbles send after switching RN then native with the same Composer store. The
native route rebinds and replays the persistent release. Exact IDs include
757166e3-c15b-41b9-8e32-fc3cc8930cd2, c80a2a1a-19bc-4ad0-9fd7-a524d63e848f,
6a23bd8b-b2a3-4bd9-afe5-b88cc3d65fb1 and4093ecfc-f519-472d-a015-6a5f9fc91db4.
Finite contacts show the normal entry, one net downward easing for the short
row, smooth latest travel and stable final placement. The scrolled own row ends
at482 with bar490. A real unpaired keyboard-up long hold opens the menu, not
the thread, then returns the same focused keyboard with the latest row482/bar490.
A separate single release opens that row's thread and Back returns directly.
This is functional recognition evidence, not a precise native text latency span.

One short-send launcher attempt used a stale AX ref and opened a thread; it is
retained as `wrong-target`, not a send result. The retry sent the expected trimmed
body, but its JS probe had been stopped by the discarded capture, so it supplies
video/message/native-release evidence without a fresh JS ACK timeline. Other
valid sends include matching ACK, exact ID, command resolution, arm and release.

Current analyzer results are NOT relabelled passes: stacked19 blank flags,
short-stacked18 blank flags during entry, scrolled-bubbles3 snap flags plus2
minor flags, rebound0 flags. Finite contacts show no old whole-list reversal;
they do not invalidate those formal flags or prove every unsampled frame.
Frame reports respectively4slow/38.3ms,5slow/33.6ms,6slow/47.4ms and8slow/35.9ms.
The last capture had Mac57%avg/63%peak with another worktree's lint active,
so it is not clean performance evidence. Real unpaired hold10slow/98.2ms and
thread-open7slow/211.3ms also remain qualified. A queue wait prevented overlap
with the other worktree's simulator boot. No thresholds, broad profiling or
unrelated optimization changed. Android mounted trajectory/lifecycle cases and
new phone artifacts are still pending; both next clients are delivered together.

### Android initial runtime blocker, 20:33 EDT

The first pre-coordinator growth attempt accidentally navigated to a thread when
a stale AX reference was used for Jump to latest. Its capture is discarded as
growth evidence. It must not become a baseline or an Android sync result.

After installing the real187f34f coordinator binary and force-stopping/relaunching
through sim.sh, the settled Mixed media screen has50 query messages and a valid
title/composer but a completely blank native area. No composer seal traces arrive.
The actual runtime `dumpsys activity top` identifies the full1080x2424 default
region as `chat.vera.messagelist.MessageListComposer`; the inner bar is another
instance of that host. The local screenshot/state/hierarchy are preserved in
`android-composer-current-initial.png`, `android-initial-blank-state.json` and
`android-composer-blank-activity.txt`.

Android's source owner confirms installed Expo aliases the FIRST declared View
as DEFAULT_MODULE_VIEW.14f57836 placed named MessageListComposer before the list,
so the old unnamed requireNativeView("MessageList") creates the host instead.
The native owner is authorized to move the named host AFTER MessageListView and
add a real module-definition default/named registration regression. No height
policy, timer, disabling the feature or fallback workaround is selected.
Both phone artifacts are held. The earlier2–3h planning window was conditional
on no new defect and is now uncertain until corrected-source/build/runtime logs.

### Corrected Android runtime and ordinary growth evidence

The corrected `9307bc1` client built at 20:41. Runtime hierarchy now shows
MessageListView in the full list region and MessageListComposer around the bar,
with 50 query rows and real seal callbacks. The default-view registration cause
is fixed at `18d435f3`, with a real Expo registration regression.

The cached pre-coordinator `8c59c078` client uses the same current JavaScript.
Independent full-width composer-edge tracking finds the bar leading the same
Leo message by 89.900 ms, 23.233 ms and 26.589 ms on three Returns. Corrected
stacked and bubbles captures each put all six newline/backspace row and bar
moves on the same original recorded frames. Final clearance is 21 physical
pixels at 2.625 density, or 8 dp. These finite samples do not guarantee every
mount. Stacked retains 4 slow frames, worst 50 ms; bubbles 2, worst 50 ms.

Stationary attachment removal follows the full 72 dp bar displacement on the
same frames within one scaled pixel, with 6 slow frames, worst 50 ms. Picker
Done/add has 22 slow frames, worst 66.7 ms, with preparation and keyboard work
overlapping. It does not isolate picker latency.

Bubbles send `e16c5427-6007-4a54-ab94-3ecee40b3aa0` establishes a deliberate
900.000209 ms physical UI stall, matching clear ACK 80.380981, exact outgoing ID,
navigation arm and native release 1. The same Leo row moves upward through
entry without reversing. UI/native/JS clocks remain separate. The deliberate
900 ms frame is fault evidence, not an FPS comparison or all-send acceptance.

### One-JPEG send load and the previous-binary control

Two ordinary stacked eight-line sends use one 29,529-byte, 960×540 JPEG. No UI
fault is armed. Both functionally ACK, authorize and publish their exact rows
and native pairs, but produce sustained load. Preserve these reports:

| Client / capture                                            | Message ID                             | Slow frames | Worst   | Mac CPU average / peak |
| ----------------------------------------------------------- | -------------------------------------- | ----------- | ------- | ---------------------- |
| Current, `r2-android-ui-send-files-busy`                    | `50d0f26b-1de4-49f0-8208-d8197b17047b` | 135         | 100 ms  | 69% / 93%              |
| Current, `r2-android-ui-send-files-quiet`                   | `f16c162a-e521-418f-a9f4-8a6a102b2af5` | 128         | 83.3 ms | 72% / 91%              |
| Previous `8c59c078`, `r2-android-ui-send-files-old-control` | `38db0e49-0d62-4e75-aa22-2b71a54c3d75` | 173         | 100 ms  | 48% / 94%              |

The quiet repeat starts at 14–16% CPU with native trace logging off. Current
clips last about 8.6 s; the single authorized control lasts 11.167 s and adds
bounded diagnostics. There is no faster/slower comparison. Raw clips, states
and frame windows remain in `.cache/evidence/` and `.cache/round2/`.

The previous client has no composerLayout feature, so the new coordinator is
not required for this workload's load. Host process samples identify our own
emulator at roughly 737–890% CPU during the bad interval, returning toward
50–180% afterward. They do not identify app versus software-emulator cost.

Control upload samples first show uploading at JS-relative 2270.9 ms, uploaded
at 3609.9 ms and canonical at 4119.1 ms. Slow frames continue later. This is not
native pulse STOP proof. Existing native logs show isolated measure/apply work,
including a 66.6 ms apply, not a continuous worker loop. Source has no obvious
unconditional ordinary-mount loop: refreshComposerGeometry checks both applied
inset and actual padding before layout. The upload ValueAnimator changes drawable
imageAlpha and invalidates; no per-frame decode/layout call appears there. A
prefetched detached holder could theoretically start an animator without a later
detach callback, but that has not been observed here.

One opt-in DEBUG pulse START/STOP and view-lifetime diagnostic is authorized,
plus one guest/RenderThread CPU window if needed. No speculative pulse disable,
height timer, animation rewrite or repeated benchmark loop. Unless an actual app
fault or permanent pulse is proved, retain this bounded common-path emulator
limit and explicitly test a photo send on BOTH next Dev phone clients. Do not
make it an indefinite unrelated delivery gate or call the frame reports passes.

### Android Modal pair-close geometry failure

Current `9307bc1` was restored after the control. The actual RN Modal pair+close
flushes release 1 at bottom 104 and retained keyboard 820, then completes real
restoration and keyboard return. Yet Pair 1 ends at y=1499 with composer top
1352, an overlap of 147 physical pixels. Its cell bounds are 1370..1499. This is
a functional failure even though the Modal Promise resolves. Expected final
clearance is 21 pixels, or 8 dp.

A fresh fixture proves valid initial latest placement. Maya's identical
"Is anyone around this weekend?" row is 1854..1983 with bar top 2004. After
keyboard focus it is 1034..1163 with bar top 1184. Both gaps are 21 pixels.
Fixture alignTop is false; this is adapter position 0 and no reader scroll
preceded the release. The pair changes its accessibility label, not insertion.
The bar moves down 168 pixels after shrinking by 64 dp. Expected row bottom is
1331; actual 1499 moves by twice that padding delta. This arithmetic helps the
source assessment but does not establish whether layout, animation or lift
restoration caused it.

Both same-batch close and release-keep-menu followed by close reproduce the
same final overlap. The latter waits 1.3 s; that is not direct worker-completion
proof because the present Android trace has no result-ready event. Captures
retain 19 slow frames / worst 100 ms and 17 / 83.3 ms respectively, Mac CPU
33% / 52% and 28% / 58% average/peak, with no overlapping boot. Raw files are
`r2-android-ui-modal-{before,after}-worker-raw.txt`, corresponding clips and
`android-composer-mounted.log`. Native owner is assessing anchoring and held-view
restoration before a narrow causal fix. No blanket always-pin, force-thaw, timer
or new contract field is accepted. Both next phone artifacts remain held.

Integration lint, typecheck, test, React Doctor against the PR base, then format
pass at this evidence checkpoint: 26 Jest tests across eight suites. These checks
do not clear the runtime failure. Android device/panel are down during source
work; phone Metro 8492 remains available.

### Causal native regression and remaining iOS attachment send

Android's focused regression now reproduces the exact 1331-versus-1499 failure
with real RecyclerView, ListLayoutManager and ListItemAnimator. Predictive layout
is enabled but the animator's `animate=false`, so this reproduction has no FLIP
translation. Fifty stable 129px rows, padding 1261→1093 and notifyItemChanged(0)
produce the extra 168px. AndroidX reverse-layout predictive PRE and POST passes
can each add the same total-space change. The owner retains the RED result and
is testing a correction only when the newest bottom is within one physical
pixel of the padded bottom before a paired padding change. Off-bottom readers,
generic smooth anchors, real insertions and short top-aligned threads are
explicit boundaries. No blanket near-latest pin or animation disable.

The remaining iOS attachment-send check uses the cached combined client and one
existing IMG_0111.heic, not a new media fixture or profiling workload. Eight-line
send `ddc05283-bc69-49ba-864f-f7ff6a66e6bb` records committed bar 302→76, clear
ACK 76, exact ID, navigation arm and pair publication. Native post-mount trace
seals host sequence 1/release 0 at height 76, then release 1 applies bottom 84
with keyboard 308. The empty strip and clear field are mounted before release;
no attachment-animation deadline supplies readiness. Representative original
frames show the existing Priya row moving upward while the photo enters. The
final typing row ends at 482 with bar top 490, an 8pt gap. This is not a claim
about every unsampled frame. Capture retains 6 slow frames, worst 129.6 ms,
Mac CPU 24% average/38% peak and no boot overlap. Files are
`r2-ios-ui-attachment-send*`, native trace `ios-ui-attachment-send-native.log`
and the original-frame contact/PTS log in `.cache/round2/`.
