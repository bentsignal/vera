# The message list's motion check

The message list has a lot of small motion: messages rising in, the rows
above making room, reactions popping in and shrinking away, a thread's
count easing in, deleted messages closing, the typing indicator handing
its place to a message, and the firehose. Each of these depends on
details the code can't check for itself, such as a layout change and the
moves that hide it reaching the screen in the same frame. `check.sh`
plays each one in the simulator, records it, and fails when the
recording shows jank, so a change that breaks one is caught here rather
than on a phone.

```sh
scripts/sim.sh up && scripts/sim.sh signin   # and scripts/sim.sh seed, once
scripts/motion/check.sh                      # every scenario, bubbles and stacked
scripts/motion/check.sh react                # only scenarios whose name matches
MOTION_LIST=rn scripts/motion/check.sh       # the React Native list (default: native)
scripts/motion/check.sh --android           # this worktree's Android emulator
```

It checks the native message list unless `MOTION_LIST=rn`, turning the
switch (`veraDev.nativeList`) to that list first, and fails a scenario
that shows the other one.

Native builds and measurements share a lock across the platform threads:

```sh
scripts/bench/with-lock.sh scripts/sim.sh build
scripts/sim.sh up # outside the lock, so a device queue wait can't block builds
scripts/bench/with-lock.sh scripts/motion/check.sh
```

The real-app comparison is `scripts/bench/head-to-head.sh`, with
`BENCH_GROUP` set to a busy media conversation. Serve a production bundle
with `VERA_METRO_PROFILE=1` when starting Metro. Both lists use a UI-thread
scroll at 5,500 points per second, then 150 arrivals over 15 seconds.
Both flings run before either burst adds messages to the conversation.
`BENCH_LAYOUT` selects `stacked` or `bubbles`. Results include UI frame
timing, JS stalls, distance travelled, and time waiting at the loaded edge.
Android also reports main-thread work from `gfxinfo`, separately from
the emulator's frame rate. Run it under `scripts/bench/with-lock.sh`.

It takes about ten minutes for everything. Run it after changing anything
under `apps/mobile/src/features/conversation` that moves: `moves.ts`,
`grow.tsx`, `arrive*.ts*`, `leave*`, reactions, `typing-*`, `entrance.tsx`,
`appearing.tsx`, `leaving.ts`. Recordings are kept in
`.cache/motion/<run>/` to look at the times it lists.

## What it flags

`analyze.ts` reads a recording (simulator recordings keep only frames
that changed), cuts the message area into short bands in three columns,
and works out how far each band moved between frames:

- **snap**: the screen at rest, then a band moves 6 points or more in one
  frame. A plain layout jump, or moves landing a frame before or after
  the space they make up for.
- **jump-back**: a band moves and comes back within two frames, or goes
  the wrong way for one frame in the middle of a move.
- **flicker**: a frame unlike both of its neighbours while they're alike
  (something gone for a frame, an opacity landing late).
- **blank**: a tall empty band between rows.

Jump-backs under 8 points and faint flickers (a band of text a fraction of a
point off for a frame) are reported as **minor** and
don't fail the check. Any React commit while rows move (a server's answer
landing then) can draw them a few points back for one frame, and the app
can't hold those off. Anything past that is something the list did.

`--allow-snaps` is for scenarios that are meant to jump, such as the
firehose. The analyzer tells moves apart by what rows show, so the check
posts a few different messages before each scenario.

## Round 2 scenarios (run only when named)

A full run is the same 18 scenarios as before, so its results compare. These
two run only when named:

```sh
# Your 👍 on a three-photo message's first photo (the deck's front card at
# rest; a carousel's first item in stacked), then a run that takes it off.
# (`react-front-media` names both; `react-front-media-remove` just the second.)
scripts/motion/check.sh react-front-media

# The real composer: five lines typed into the field, then Send pressed.
# MOTION_AD runs agent-device on this worktree's device, for example a
# wrapper script holding its --platform, --udid, --config and --session.
MOTION_AD=.cache/round2/ad-ios scripts/motion/check.sh composer-send
```

Each setup step and action of these cases is logged with its exit status to
`.cache/motion/<run>/<label>.actions.log`. A step that fails fails the case,
so a recording never counts when what it records didn't happen.
`composer-send` also checks that the five-line message was sent. A filter
is a substring, so `react` runs these two along with `react-add` and
`react-remove`. Without `MOTION_AD`, `composer-send` is skipped, not failed. agent-device
reads the screen as it taps, which can stall the app for a moment, so look at
the recording as well as the flags. Typing to the first arrival is
`typing-reply` (`--android` for Android). Whether the new row fades in is
judged from the frames: the analyzer follows positions, not opacity.

## Why the moves land together

See the comments on `IN_COMMIT`, `afterCommit`, `ease`, and `land` in
`moves.ts`. In short: Reanimated waits to commit layout while React is
committing, but transforms can still reach the screen. So moves start two
frames after the React commit that brought the change, they ease only once
the change is laid out, and the app's own React renders (`useHeldHeight`,
`useLeaving`, `Entrance`) wait until the rows have stopped. Parts that come
in or go out use animated styles, not layout animations (`entering`,
`exiting`), which hold up the commit their space is in.
