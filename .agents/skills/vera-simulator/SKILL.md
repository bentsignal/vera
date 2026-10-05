---
name: vera-simulator
description: Required before you use an iOS simulator or Android emulator in this repo for any reason, such as verifying a change, taking screenshots or videos, or reproducing a bug. Every worktree shares one Mac, so devices start only through scripts/sim.sh and its queue. This skill has the rules that keep the Mac usable, the commands, and how to wait your turn.
---

# Simulators and emulators

Many worktrees run at once on Shawn's Mac, and each simulator with its
Metro takes 2 to 4 GB. `scripts/sim.sh up` waits in the simulator queue
(`scripts/simq.ts`), which starts one device at a time and only while the
Mac has free memory. The queue only works if every agent goes through it.

## Rules

1. **Only `scripts/sim.sh` starts, stops, or deletes a device.** Never boot
   or create one any other way: no `xcrun simctl boot` or `create`, no
   `npx expo run:ios` or `run:android`, no `expo start --ios`, no
   `emulator -avd`, no Xcode or Android Studio runs. They skip the queue.
   `xcrun simctl` and `adb` on your own device for settings, such as
   `xcrun simctl ui <udid> appearance dark`, are fine.
2. **Never skip the queue.** Don't set `VERA_SIMQ=off`, don't stop or kill
   the daemon (`simq.ts stop`), and don't edit `~/.config/vera/simq.json`;
   that's Shawn's.
3. **Only touch your own worktree's device and Metro.** Never use, stop, or
   screenshot another worktree's simulator, even one that looks abandoned.
   The queue cleans those up.
4. **Wait your turn.** If `up` prints `simulator queue: position N of M`,
   it's waiting, and says why. If it exits with code 75 ("still queued"),
   run `up` again right away to keep your place; the place lapses after 5
   minutes. If your harness can run commands in the background and wake you
   when they finish, run `up` that way and do other work meanwhile, such as
   validation or pushing your branch.
5. **Hold a device only while you're using it.** Bring it up when you're
   ready to verify, not while you're still writing code, and `down` as soon
   as you have your evidence, before you wait for CI or for Shawn.
6. **If the queue shut your device down**, your next `sim.sh` command says
   so. Run `up` again. When others are waiting, it shuts down devices that
   haven't had a `sim.sh` command for 20 minutes.

## Commands

```sh
scripts/sim.sh up             # wait for a slot, then dev client + this worktree's simulator + Metro
scripts/sim.sh signin         # dev sign-in as this worktree's test user (wt…)
scripts/sim.sh seed           # bot DMs, a group, a space, and a space invite
scripts/sim.sh open /settings # go to any route; conversation/<id>, profile/<address>, ...
scripts/sim.sh relaunch       # restart the app, e.g. to drop the keyboard or reset state
scripts/sim.sh shot <name>    # screenshot to .cache/evidence/<name>.png
scripts/sim.sh record <name>  # start a video; `scripts/sim.sh stop` ends it
scripts/sim.sh status         # this worktree's devices, Metro, and backend
scripts/sim.sh queue          # every device on the Mac, who is waiting, and why
scripts/sim.sh down           # delete the device; Metro stops with the last one
```

Every command takes `--android` first for this worktree's Android emulator
(`scripts/sim.sh --android up`, `scripts/sim.sh --android shot after`). Both
platforms share the worktree's Metro and wait in the same queue. Check
Android whenever a change touches layout, navigation, platform files
(`.ios.tsx`/`.android.tsx`), or native config. In T3 Code, `device_open`
takes the emulator serial `up` prints (`emulator-55xx`), with
`platform: "android"`.

- `up` reuses the cached dev client unless native code changed (the first
  build of a fingerprint takes about 10 minutes and is shared by every
  worktree; it happens before `up` joins the queue). Re-run `up` after
  changing native code, `app.config.ts`, or `.env.local`, including after
  `scripts/backend.sh isolate`. JavaScript edits hot-reload;
  `scripts/sim.sh reload` forces it.
- Routes with parameters take them as a query string. Read the route file
  under `apps/mobile/src/app` for the names, such as
  `/settings/account?account=<address>&title=<name>`.
- Seed once per account. Running it again reuses the bot DMs but adds
  another group and space. For a clean slate, sign in as a new username.
- `signin` takes a username (`scripts/sim.sh signin alice`) for a second
  account. On the shared dev PDS keep to your worktree's `wt…` user so you
  don't disturb anyone else's data.
- Let Shawn watch: call the T3 `device_open` tool with the simulator UDID
  that `up` prints. It returns the exact `agent-device` command and flags.
  Run `agent-device open chat.vera.app.dev "${F[@]}"` once before other
  agent-device commands (they fail with "Run open first" otherwise). It also
  brings Vera back to the front if `device_open` left the home screen up.
- Use agent-device for taps, typing, scrolling, and gestures (`snapshot -i`,
  `press @e3`, `fill`, `longpress`, `scroll`). Its refs (`@e12`) expire
  after every action, so take a fresh `snapshot -i` before each tap or
  fill. To clear a multiline field, select all through the field's edit
  menu or hold delete (`longpress <delete key> 4000`); `fill` may not clear
  it. Each action takes a few seconds, so timing-sensitive behavior
  (debounces under a second) needs a code-level check instead. In zsh, put
  the flags in an array (`F=(--platform ios ...)` then `"$F[@]"`), because
  a flags string isn't split.
- Use `scripts/sim.sh open` for navigation, not typed URLs or
  `xcrun simctl openurl`: iOS asks "Open in Vera?" every time. If one
  appears anyway, `agent-device alert accept`.
- Check Metro's log (`.cache/sim/metro.log`) for red boxes and warnings you
  introduced.

## Shutting down

When you have your evidence, run `scripts/sim.sh down`, and
`scripts/sim.sh --android down` if you used Android. They delete the
simulator or emulator, give the slot back to the queue, and stop Metro with
the last device. Also close it in T3's Device panel (`device_close`). `up`
brings one back in about a minute with the cached build, so there's no
reason to keep one around.

## Troubleshooting

- **`up` keeps saying you're queued:** `scripts/sim.sh queue` shows why.
  That's working as intended; keep waiting. Tell Shawn if the line hasn't
  moved in half an hour.
- **`up` says Metro didn't start:** read `.cache/sim/metro.log`. A port
  clash is resolved automatically. Kill only the PID in `.cache/sim/metro`,
  never by pattern (other worktrees run Metro too).
- **The app shows the dev launcher instead of Vera:** `scripts/sim.sh relaunch`.
- **The dev client build fails:** run the `xcodebuild` from
  `apps/mobile/README.md` by hand to see the error. It is usually a missing
  `pod install` after dependency changes; `up` runs prebuild with `--clean`.
