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
