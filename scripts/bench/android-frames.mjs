#!/usr/bin/env node
// Android's main thread per frame while a scenario runs, for
// scripts/bench/head-to-head.sh --android:
//
//   node scripts/bench/android-frames.mjs <serial> <package> <seconds>
//
// Polls `dumpsys gfxinfo <package> framestats` (which keeps only the last
// 120 frames) every half second, keeps each frame once, and prints JSON:
// how many frames, the main thread's time per frame (HandleInputStart to
// SyncQueued: input, animation, layout and recording the frame) at the
// 50th, 90th and 99th percentiles, the worst, and how many took over 16.7
// ms. Software GL and host load also affect the emulator's frame intervals,
// so report this app work separately from end-to-end callback cadence.
import { execFileSync } from "node:child_process";

const [serial, pkg, seconds] = process.argv.slice(2);
const adb = `${process.env.ANDROID_HOME ?? `${process.env.HOME}/Library/Android/sdk`}/platform-tools/adb`;
const frames = new Map();

function poll() {
  const out = execFileSync(adb, ["-s", serial, "shell", "dumpsys", "gfxinfo", pkg, "framestats"], {
    encoding: "utf8",
  });
  const lines = out.split("\n");
  const start = lines.findIndex((line) => line.startsWith("---PROFILEDATA---"));
  if (start < 0) return;
  const header = lines[start + 1].split(",");
  const col = (name) => header.indexOf(name);
  for (const line of lines.slice(start + 2)) {
    if (line.startsWith("---")) break;
    const cells = line.split(",");
    if (cells.length < header.length - 1 || cells[col("Flags")] !== "0") continue;
    const vsync = cells[col("IntendedVsync")];
    const main = (Number(cells[col("SyncQueued")]) - Number(cells[col("HandleInputStart")])) / 1e6;
    if (main > 0) frames.set(vsync, main);
  }
}

execFileSync(adb, ["-s", serial, "shell", "dumpsys", "gfxinfo", pkg, "reset"]);
const until = Date.now() + Number(seconds) * 1000;
while (Date.now() < until) {
  poll();
  await new Promise((resolve) => setTimeout(resolve, 500));
}
poll();
const times = [...frames.values()].sort((a, b) => a - b);
const at = (p) => Math.round((times[Math.min(times.length - 1, Math.floor(times.length * p))] ?? 0) * 10) / 10;
console.log(
  JSON.stringify({
    frames: times.length,
    mainOver16: times.filter((t) => t > 1000 / 60).length,
    p50: at(0.5),
    p90: at(0.9),
    p99: at(0.99),
    worst: Math.round((times.at(-1) ?? 0) * 10) / 10,
  }),
);
