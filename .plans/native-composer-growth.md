# Ordinary composer growth: ownership proposal, October24

Status: source proposal for review, not an implemented fix. Send ACK and both
native freeze/latest paths already pass Shawn's phones and remain constraints.

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
