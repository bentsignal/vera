// The simulator queue. Every worktree that runs `scripts/sim.sh up` asks it
// for a slot first, and so does every performance measurement
// (`sim.sh frames start`). Up to three simulators and emulators run at once
// by default (a stress test on Shawn's 32 GB M4: three animating together
// draw like one; at four the GPU runs out and every device lags). A boot
// pins every core until it settles, so boots and performance measurements
// wait in one line and never overlap: a boot runs alone, from its slot
// until the Mac's CPU calms down after launch, while measurements can run
// side by side. scripts/sim.sh is the only caller; the daemon starts on
// first use and exits after ten idle minutes. `VERA_SIMQ=off` skips it.
//
//   node --experimental-strip-types scripts/simq.ts <command> [--worktree <path>]
//
//   acquire <ios|android> [--wait <seconds>]   wait for a slot; exit 75 means still queued, run again
//   ready <ios|android> [--device <id>] [--serial <serial>] [--metro-pid <pid>]
//                                               the device is up; it boots alone until the CPU settles
//   release <ios|android>                       give the slot back
//   perf-start <ios|android> [--wait <seconds>] wait until no device is booting, then hold boots off
//   perf-stop <ios|android>                     let boots go again; prints how busy the Mac was
//   status                                      slots, the queue, memory, and the config in effect
//   stop                                        stop the daemon (slots persist in state.json)
//   daemon                                      run the daemon in the foreground
//
// Admission takes the line in order. Nothing goes while a device is booting
// (from its slot until the CPU settles after launch, at most a few
// minutes). A measurement then goes right away, alongside any others. A
// device waits for running measurements to finish; then the first device
// always gets in, and the next only while fewer than `max` are up, memory
// pressure is normal, and free memory covers its estimate plus a reserve.
// When a device can't get in, one nobody has used for `idleMinutes` is shut
// down to make room. A measurement holds boots off for `PERF_LIMIT` at most.
//
// Devices also come down with nobody waiting: one unused for
// `maxIdleMinutes` (an agent that ended its turn with it up), and one that
// stopped running without `sim.sh down` (shut down by hand, or a crashed
// simulator), so its slot, Metro, and state don't linger. Tune it in
// ~/.config/vera/simq.json:
//
//   { "max": 3, "reserveGb": 5, "iosGb": 3, "androidGb": 4, "idleMinutes": 10, "maxIdleMinutes": 30 }
//
// Edits apply on the next check, with no restart.
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer, request } from "node:http";
import { cpus, freemem, homedir, platform, totalmem } from "node:os";
import { basename, join } from "node:path";

type Kind = "ios" | "android";
type Device = { device?: string; serial?: string; metroPid?: number };
type Lease = Device & {
  worktree: string;
  kind: Kind;
  // The sim.sh process that asked; until the device is ready, the slot
  // goes back if it dies without leaving a device behind.
  pid: number;
  queuedAt: number;
  grantedAt: number;
  readyAt?: number;
  // When the CPU calmed down after launch; until then the device is booting.
  settledAt?: number;
  reclaiming?: boolean;
  // Its sim.sh couldn't run; never picked for reclaiming again.
  reclaimFailed?: boolean;
};
type Op = "device" | "perf";
type Waiter = {
  op: Op;
  worktree: string;
  kind: Kind;
  pid: number;
  since: number;
  seenAt: number;
};
// A performance measurement in progress, and the Mac's CPU during it.
type Perf = {
  worktree: string;
  kind: Kind;
  startedAt: number;
  cpu: number[];
  // A device booted during it anyway (it outlasted PERF_LIMIT).
  overlapped: boolean;
  expired?: boolean;
};
type Config = {
  reserveGb: number;
  iosGb: number;
  androidGb: number;
  max: number;
  idleMinutes: number;
  maxIdleMinutes: number;
};
type Memory = {
  total: number;
  free: number;
  pressure: "normal" | "warn" | "critical";
};

const VERSION = 4;
const DIR = join(homedir(), "Library/Caches/vera/simq");
const SOCKET = join(DIR, "daemon.sock");
const LOCK = join(DIR, "daemon.lock");
const STATE = join(DIR, "state.json");
const LOG = join(DIR, "daemon.log");
const CONFIG = join(homedir(), ".config/vera/simq.json");
const STILL_QUEUED = 75;
const GB = 1024 ** 3;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
// How long a granted device may take to boot and launch before the next
// one is let in anyway.
const START_LIMIT = 8 * MINUTE;
const SETTLE = 15 * SECOND;
// After launch, a device keeps booting until the Mac's CPU is under
// SETTLED_CPU percent for two checks in a row, at least SETTLE_MIN and at
// most SETTLE_LIMIT after it launched.
const SETTLE_MIN = 10 * SECOND;
const SETTLE_LIMIT = 150 * SECOND;
const SETTLED_CPU = 40;
// A measurement that runs longer than this stops holding boots off.
const PERF_LIMIT = 3 * MINUTE;
// A waiter that stops polling loses its turn to the next one after this,
// and its place in line after WAITER_TIMEOUT.
const ACTIVE = 10 * SECOND;
const WAITER_TIMEOUT = 5 * MINUTE;
const IDLE_EXIT = 10 * MINUTE;
// How often the daemon checks that each device is still running.
const LIVENESS = 30 * SECOND;

const key = (worktree: string, kind: Kind) => `${worktree}#${kind}`;
const label = (x: { worktree: string; kind: Kind }) =>
  `${basename(x.worktree)} ${x.kind}`;
const describe = (waiter: Waiter) =>
  `${label(waiter)}${waiter.op === "perf" ? "'s measurement" : ""}`;
const gb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;
const ago = (ms: number) =>
  ms < MINUTE ? `${Math.round(ms / SECOND)}s` : `${Math.round(ms / MINUTE)}m`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readConfig(): Config {
  const defaults: Config = {
    reserveGb: Math.max(4, Math.round((totalmem() / GB) * 0.15 * 10) / 10),
    iosGb: 3,
    androidGb: 4,
    max: 3,
    idleMinutes: 10,
    maxIdleMinutes: 30,
  };
  try {
    return { ...defaults, ...JSON.parse(readFileSync(CONFIG, "utf8")) };
  } catch {
    return defaults;
  }
}

// macOS counts compressible and purgeable pages as free here, the same
// figure as `memory_pressure`'s "memory free percentage".
function readMemory(): Memory {
  const total = totalmem();
  if (platform() !== "darwin")
    return { total, free: freemem(), pressure: "normal" };
  const [level, pressure] = execFileSync(
    "sysctl",
    ["-n", "kern.memorystatus_level", "kern.memorystatus_vm_pressure_level"],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map(Number);
  return {
    total,
    free: (total * (level ?? 0)) / 100,
    pressure: pressure === 4 ? "critical" : pressure === 2 ? "warn" : "normal",
  };
}

// Total and idle CPU time across every core, to take the busy share between
// two readings.
function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus()) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

// sim.sh's state file for a worktree's device: DEVICE=... when one exists.
// Every sim.sh command touches it, so its mtime is the last use.
function deviceState(worktree: string, kind: Kind) {
  const file = join(worktree, ".cache/sim", kind);
  try {
    const hasDevice = /^DEVICE=.+$/m.test(readFileSync(file, "utf8"));
    return { hasDevice, usedAt: statSync(file).mtimeMs };
  } catch {
    return { hasDevice: false, usedAt: 0 };
  }
}

function alive(pid: number | undefined) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Whether each device is still running: booted simulators, and emulators
// adb can reach. Undefined when it can't tell.
function runningDevices(): Set<string> | undefined {
  try {
    const running = new Set<string>();
    const sims = JSON.parse(
      execFileSync("xcrun", ["simctl", "list", "devices", "booted", "-j"], {
        encoding: "utf8",
        timeout: 20 * SECOND,
      }),
    ).devices as Record<string, { udid: string }[]>;
    for (const list of Object.values(sims))
      for (const sim of list) running.add(sim.udid);
    const sdk =
      process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
    const adb = join(sdk, "platform-tools/adb");
    if (existsSync(adb)) {
      const lines = execFileSync(adb, ["devices"], {
        encoding: "utf8",
        timeout: 20 * SECOND,
      }).split("\n");
      for (const line of lines) {
        const [serial, state] = line.trim().split(/\s+/);
        if (serial?.startsWith("emulator-") && state === "device")
          running.add(serial);
      }
    }
    return running;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- daemon

function daemon() {
  mkdirSync(DIR, { recursive: true });
  if (!takeLock()) {
    console.log("another daemon is running");
    return;
  }
  const leases = new Map<string, Lease>();
  try {
    for (const lease of JSON.parse(readFileSync(STATE, "utf8"))
      .leases as Lease[]) {
      // Saved by an older daemon, which didn't track settling.
      if (lease.readyAt) lease.settledAt ??= lease.readyAt;
      leases.set(key(lease.worktree, lease.kind), lease);
    }
  } catch {
    // No saved slots.
  }
  const waiters: Waiter[] = [];
  const perfs = new Map<string, Perf>();
  // Measurements that outlasted PERF_LIMIT, kept for their perf-stop.
  const expired = new Map<string, Perf>();
  // The Mac's CPU: busy percent over the last tick, and how many ticks in
  // a row it has been under SETTLED_CPU.
  let cpuReading = cpuTimes();
  let cpuBusy = 0;
  let calmTicks = 0;
  // Why the queue's head is waiting, for status and for the waiters.
  let blocked = "";
  let idleSince = Date.now();
  // When a device last started or was shut down to make room; memory is
  // measured again only after it settles.
  let changedAt = 0;
  let checkedAt = 0;

  const log = (message: string) =>
    console.log(`${new Date().toISOString()} ${message}`);
  const save = () => {
    writeFileSync(
      `${STATE}.tmp`,
      JSON.stringify({ leases: [...leases.values()] }, null, 2),
    );
    renameSync(`${STATE}.tmp`, STATE);
  };
  const drop = (lease: Lease, why: string) => {
    leases.delete(key(lease.worktree, lease.kind));
    log(`freed ${label(lease)}: ${why}`);
    save();
  };

  function reap(now: number) {
    for (const lease of leases.values()) {
      if (lease.reclaiming) continue;
      if (!existsSync(lease.worktree)) {
        cleanUpOrphan(lease);
        drop(lease, "its worktree was deleted; shut its device down");
        continue;
      }
      const state = deviceState(lease.worktree, lease.kind);
      if (!lease.readyAt && !alive(lease.pid)) {
        if (state.hasDevice) {
          // `up` failed after creating the device; it still uses memory.
          lease.readyAt = now;
          save();
        } else {
          drop(lease, "`up` stopped before creating a device");
        }
      } else if (lease.readyAt && !state.hasDevice) {
        drop(lease, "its device is gone");
      }
    }
    for (let i = waiters.length - 1; i >= 0; i--) {
      const waiter = waiters[i]!;
      const id = key(waiter.worktree, waiter.kind);
      const done =
        waiter.op === "device"
          ? leases.has(id)
          : perfs.has(id) || !leases.get(id)?.readyAt;
      if (now - waiter.seenAt > WAITER_TIMEOUT || done) {
        waiters.splice(i, 1);
      }
    }
    for (const [id, perf] of perfs) {
      if (!leases.has(id)) {
        perfs.delete(id);
        log(`dropped ${label(perf)}'s measurement: its device is gone`);
      } else if (now - perf.startedAt > PERF_LIMIT) {
        perfs.delete(id);
        expired.set(id, { ...perf, expired: true });
        log(`${label(perf)}'s measurement passed ${ago(PERF_LIMIT)}; boots can go`);
      }
    }
  }

  // A device boots from its slot until the CPU settles after launch.
  const booting = (lease: Lease, now: number) =>
    !lease.settledAt &&
    (lease.readyAt !== undefined || now - lease.grantedAt < START_LIMIT);

  function measureCpu(now: number) {
    const reading = cpuTimes();
    const total = reading.total - cpuReading.total;
    if (total > 0)
      cpuBusy = Math.round(100 * (1 - (reading.idle - cpuReading.idle) / total));
    cpuReading = reading;
    calmTicks = cpuBusy < SETTLED_CPU ? calmTicks + 1 : 0;
    const boot = [...leases.values()].some((lease) => booting(lease, now));
    for (const perf of perfs.values()) {
      perf.cpu.push(cpuBusy);
      if (boot) perf.overlapped = true;
    }
    for (const lease of leases.values()) {
      if (!lease.readyAt || lease.settledAt) continue;
      const since = now - lease.readyAt;
      if (since > SETTLE_LIMIT || (since >= SETTLE_MIN && calmTicks >= 2)) {
        lease.settledAt = now;
        log(
          `${label(lease)} settled ${ago(since)} after launch (CPU ${cpuBusy}% busy)`,
        );
        save();
      }
    }
  }

  // A worktree deleted with its device up leaves the device and Metro
  // running with nobody to stop them.
  function cleanUpOrphan(lease: Lease) {
    const run = (command: string, args: string[]) => {
      try {
        execFileSync(command, args, { stdio: "ignore", timeout: 60 * SECOND });
      } catch {
        // Already gone.
      }
    };
    if (lease.kind === "ios" && lease.device) {
      run("xcrun", ["simctl", "shutdown", lease.device]);
      run("xcrun", ["simctl", "delete", lease.device]);
    } else if (lease.kind === "android") {
      const sdk =
        process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk");
      if (lease.serial)
        run(join(sdk, "platform-tools/adb"), [
          "-s",
          lease.serial,
          "emu",
          "kill",
        ]);
      if (lease.device) {
        run(join(sdk, "cmdline-tools/latest/bin/avdmanager"), [
          "-s",
          "delete",
          "avd",
          "-n",
          lease.device,
        ]);
      }
    }
    if (alive(lease.metroPid)) {
      run("pkill", ["-TERM", "-P", String(lease.metroPid)]);
      run("kill", ["-TERM", String(lease.metroPid)]);
    }
  }

  // Shuts a device down through its own worktree's sim.sh, so its state
  // stays consistent, and leaves a note that the worktree's next sim.sh
  // command prints.
  function reclaim(lease: Lease, why: string, note: string) {
    lease.reclaiming = true;
    log(`shutting down ${label(lease)}, ${why}`);
    const child = spawn(
      join(lease.worktree, "scripts/sim.sh"),
      lease.kind === "android" ? ["--android", "down"] : ["down"],
      {
        cwd: lease.worktree,
        stdio: "ignore",
        env: { ...process.env, VERA_SIMQ: "off" },
      },
    );
    child.on("exit", () => {
      try {
        writeFileSync(
          join(lease.worktree, ".cache/sim", `${lease.kind}.reclaimed`),
          `${note} Run \`scripts/sim.sh${lease.kind === "android" ? " --android" : ""} up\` to get it back.\n`,
        );
      } catch {
        // The worktree is gone.
      }
      changedAt = Date.now();
      if (leases.get(key(lease.worktree, lease.kind)) === lease)
        drop(lease, why);
    });
    child.on("error", (error) => {
      log(`couldn't shut down ${label(lease)}: ${String(error)}`);
      lease.reclaiming = false;
      lease.reclaimFailed = true;
    });
  }

  // The ready devices nobody has used for `minutes`, longest unused first.
  function unused(now: number, minutes: number) {
    return [...leases.values()]
      .filter((lease) => lease.readyAt && !lease.reclaimFailed)
      .map((lease) => ({
        lease,
        usedAt: deviceState(lease.worktree, lease.kind).usedAt,
      }))
      .filter(({ usedAt }) => now - usedAt > minutes * MINUTE)
      .sort((a, b) => a.usedAt - b.usedAt);
  }

  // Shuts down the device nobody has used for longest to make room.
  function reclaimIdle(now: number, config: Config) {
    if ([...leases.values()].some((lease) => lease.reclaiming)) return true;
    const idle = unused(now, config.idleMinutes)[0];
    if (!idle) return false;
    reclaim(
      idle.lease,
      `unused for ${ago(now - idle.usedAt)}, to make room`,
      `The simulator queue shut this ${idle.lease.kind} device down after ${config.idleMinutes} unused minutes so another worktree could start one.`,
    );
    return true;
  }

  // Devices left up with nobody waiting: unused for `maxIdleMinutes`, or no
  // longer running at all.
  function reclaimAbandoned(now: number, config: Config) {
    for (const { lease, usedAt } of unused(now, config.maxIdleMinutes)) {
      if (lease.reclaiming) continue;
      reclaim(
        lease,
        `unused for ${ago(now - usedAt)}`,
        `The simulator queue shut this ${lease.kind} device down after ${config.maxIdleMinutes} unused minutes. Bring a device up only while you use it, and \`down\` it before you end your turn.`,
      );
    }
    if (now - checkedAt < LIVENESS) return;
    if (![...leases.values()].some((lease) => lease.readyAt)) return;
    checkedAt = now;
    const running = runningDevices();
    if (!running) return;
    for (const lease of leases.values()) {
      if (!lease.readyAt || lease.reclaiming || lease.reclaimFailed) continue;
      const id = lease.kind === "ios" ? lease.device : lease.serial;
      if (!id || running.has(id)) continue;
      reclaim(
        lease,
        "it stopped running without `sim.sh down`",
        `This ${lease.kind} device stopped running without \`scripts/sim.sh down\`, so the simulator queue deleted it and stopped Metro.`,
      );
    }
  }

  // Takes the line in order: measurements go together, devices one at a
  // time, and nothing while a device is booting.
  function admit(now: number) {
    blocked = "";
    if (waiters.length === 0) return;
    const config = readConfig();
    const all = [...leases.values()];
    const boot = all.find((lease) => booting(lease, now));
    if (boot) {
      blocked = `${label(boot)} is booting; boots and performance measurements take turns`;
      return;
    }
    const ready = waiters.filter(
      (waiter) => now - waiter.seenAt < ACTIVE && alive(waiter.pid),
    );
    for (const head of ready) {
      if (head.op === "perf") {
        waiters.splice(waiters.indexOf(head), 1);
        perfs.set(key(head.worktree, head.kind), {
          worktree: head.worktree,
          kind: head.kind,
          startedAt: now,
          cpu: [],
          overlapped: false,
        });
        log(`${label(head)} is measuring, after ${ago(now - head.since)}`);
        continue;
      }
      const measuring = [...perfs.values()][0];
      if (measuring) {
        blocked = `${label(measuring)} is measuring performance; boots wait for it`;
        return;
      }
      const lastChange = Math.max(
        changedAt,
        ...all.map((lease) => lease.readyAt ?? lease.grantedAt),
      );
      if (now - lastChange < SETTLE) {
        blocked =
          "letting memory settle after the last device started or stopped";
        return;
      }
      if (all.length > 0) {
        const memory = readMemory();
        const need =
          ((head.kind === "ios" ? config.iosGb : config.androidGb) +
            config.reserveGb) *
          GB;
        if (all.length >= config.max) {
          blocked = `${all.length} devices are up, the max`;
          // A worktree holding its other platform can free its own slot.
          const own = all.find((lease) => lease.worktree === head.worktree);
          if (own) {
            blocked += `; one is yours: \`scripts/sim.sh${own.kind === "android" ? " --android" : ""} down\` frees it`;
          }
        } else if (memory.pressure !== "normal") {
          blocked = `memory pressure is ${memory.pressure}`;
        } else if (memory.free < need) {
          blocked = `${gb(memory.free)} free; a ${head.kind} device needs ${gb(need)} with the reserve`;
        }
        if (blocked) {
          if (reclaimIdle(now, config))
            blocked += "; shutting down an idle device";
          return;
        }
      }
      waiters.splice(waiters.indexOf(head), 1);
      leases.set(key(head.worktree, head.kind), {
        worktree: head.worktree,
        kind: head.kind,
        pid: head.pid,
        queuedAt: head.since,
        grantedAt: now,
      });
      log(
        `admitted ${label(head)} after ${ago(now - head.since)} (${gb(readMemory().free)} free)`,
      );
      save();
      return;
    }
  }

  function tick() {
    const now = Date.now();
    measureCpu(now);
    reap(now);
    admit(now);
    reclaimAbandoned(now, readConfig());
    if (leases.size > 0 || waiters.length > 0) idleSince = now;
    else if (now - idleSince > IDLE_EXIT) shutdown("idle");
  }

  function status() {
    const now = Date.now();
    const config = readConfig();
    return {
      version: VERSION,
      memory: readMemory(),
      config,
      cpu: cpuBusy,
      leases: [...leases.values()].map((lease) => ({
        ...lease,
        booting: booting(lease, now),
        usedAt: deviceState(lease.worktree, lease.kind).usedAt,
      })),
      perfs: [...perfs.values()].map(({ cpu: _, ...perf }) => perf),
      waiters: waiters.map((waiter, i) => ({
        ...waiter,
        reason: i === 0 ? blocked : "",
      })),
      now,
    };
  }

  // Joins the line, or keeps an existing place, and admits who can go.
  function wait(op: Op, worktree: string, kind: Kind, pid: number, now: number) {
    const id = key(worktree, kind);
    let waiter = waiters.find(
      (w) => w.op === op && key(w.worktree, w.kind) === id,
    );
    if (!waiter) {
      waiter = { op, worktree, kind, pid, since: now, seenAt: now };
      waiters.push(waiter);
      log(`queued ${label(waiter)}${op === "perf" ? " measurement" : ""}`);
    }
    waiter.seenAt = now;
    waiter.pid = pid;
    admit(now);
    if (op === "device" ? leases.has(id) : perfs.has(id))
      return { granted: true, waited: now - waiter.since };
    const position = waiters.indexOf(waiter) + 1;
    return {
      granted: false,
      position,
      queued: waiters.length,
      reason: position === 1 ? blocked : `behind ${describe(waiters[0]!)}`,
    };
  }

  type Body = { worktree: string; kind: Kind; pid?: number } & Device;
  const routes: Record<string, (body: Body) => unknown> = {
    "/acquire": ({ worktree, kind, pid = 0 }) => {
      const now = Date.now();
      const lease = leases.get(key(worktree, kind));
      if (lease) {
        if (!alive(lease.pid)) lease.pid = pid;
        save();
        // The wait is news only to the poll that finds the new slot.
        const fresh = now - lease.grantedAt < ACTIVE;
        return {
          granted: true,
          waited: fresh ? lease.grantedAt - lease.queuedAt : 0,
        };
      }
      return wait("device", worktree, kind, pid, now);
    },
    "/perf-start": ({ worktree, kind, pid = 0 }) => {
      const now = Date.now();
      const id = key(worktree, kind);
      if (!leases.get(id)?.readyAt) return { granted: true, untracked: true };
      expired.delete(id);
      if (perfs.has(id)) return { granted: true, waited: 0 };
      return wait("perf", worktree, kind, pid, now);
    },
    "/perf-stop": ({ worktree, kind }) => {
      const id = key(worktree, kind);
      const perf = perfs.get(id) ?? expired.get(id);
      perfs.delete(id);
      expired.delete(id);
      if (!perf) return { measured: false };
      const cpu = perf.cpu.length
        ? Math.round(perf.cpu.reduce((a, b) => a + b, 0) / perf.cpu.length)
        : cpuBusy;
      return {
        measured: true,
        seconds: Math.round((Date.now() - perf.startedAt) / SECOND),
        cpu,
        peak: Math.max(cpuBusy, ...perf.cpu),
        overlapped: perf.overlapped,
        expired: perf.expired ?? false,
      };
    },
    "/ready": ({ worktree, kind, device, serial, metroPid }) => {
      const lease = leases.get(key(worktree, kind));
      if (!lease) return { ok: false };
      Object.assign(lease, { readyAt: Date.now(), device, serial, metroPid });
      log(
        `${label(lease)} is up after ${ago(lease.readyAt! - lease.grantedAt)}`,
      );
      save();
      return { ok: true };
    },
    "/release": ({ worktree, kind }) => {
      const lease = leases.get(key(worktree, kind));
      if (lease && !lease.reclaiming) drop(lease, "released");
      return { ok: true };
    },
    "/status": () => status(),
    "/stop": () => {
      setTimeout(() => shutdown("stopped"), 50);
      return { ok: true };
    },
  };

  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const route = routes[req.url ?? ""];
      if (!route) {
        res.writeHead(404).end();
        return;
      }
      try {
        const result = route(raw ? JSON.parse(raw) : {});
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify(result));
      } catch (error) {
        log(`error on ${req.url}: ${String(error)}`);
        res.writeHead(500).end(JSON.stringify({ error: String(error) }));
      }
    });
  });

  function shutdown(why: string) {
    log(`daemon exiting (${why})`);
    server.close();
    rmSync(SOCKET, { force: true });
    rmSync(LOCK, { recursive: true, force: true });
    process.exit(0);
  }

  rmSync(SOCKET, { force: true });
  server.listen(SOCKET, () =>
    log(`daemon ${VERSION} listening (pid ${process.pid})`),
  );
  setInterval(tick, 2 * SECOND);
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// One daemon at a time: a lock directory holding the owner's pid, taken
// over when that process is gone.
function takeLock(): boolean {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(LOCK);
      writeFileSync(join(LOCK, "pid"), String(process.pid));
      return true;
    } catch {
      let owner = 0;
      try {
        owner = Number(readFileSync(join(LOCK, "pid"), "utf8"));
      } catch {
        // Being written right now, or left half-made.
      }
      if (alive(owner)) return false;
      if (attempt === 0) rmSync(LOCK, { recursive: true, force: true });
    }
  }
  return false;
}

// ---------------------------------------------------------------- client

function call<T>(path: string, body: object = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = request({ socketPath: SOCKET, path, method: "POST" }, (res) => {
      let raw = "";
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode !== 200)
          reject(new Error(`daemon answered ${res.statusCode}: ${raw}`));
        else resolve(JSON.parse(raw) as T);
      });
    });
    req.on("error", reject);
    req.end(JSON.stringify(body));
  });
}

async function connect(start: boolean): Promise<boolean> {
  try {
    const { version } = await call<{ version: number }>("/status");
    if (!start || version >= VERSION) return true;
    // An older daemon from another checkout; replace it. Slots persist in
    // state.json, so nobody loses theirs.
    await call("/stop");
    for (let i = 0; i < 50 && existsSync(SOCKET); i++) await sleep(100);
  } catch {
    if (!start) return false;
  }
  mkdirSync(DIR, { recursive: true });
  try {
    if (statSync(LOG).size > 1024 * 1024) rmSync(LOG);
  } catch {
    // No log yet.
  }
  const log = openSync(LOG, "a");
  spawn(
    process.execPath,
    [...process.execArgv, import.meta.filename, "daemon"],
    {
      cwd: DIR,
      detached: true,
      stdio: ["ignore", log, log],
    },
  ).unref();
  closeSync(log);
  for (let i = 0; i < 50; i++) {
    await sleep(100);
    try {
      await call("/status");
      return true;
    } catch {
      // Still starting.
    }
  }
  return false;
}

// Waits for a device slot (`/acquire`) or a turn to measure (`/perf-start`).
async function waitTurn(
  path: "/acquire" | "/perf-start",
  worktree: string,
  kind: Kind,
  waitSeconds: number,
) {
  if (!(await connect(true))) {
    console.error(
      `the simulator queue didn't start (see ${LOG}); going ahead without it`,
    );
    return 0;
  }
  const flag = kind === "android" ? " --android" : "";
  const retry =
    path === "/acquire"
      ? `scripts/sim.sh${flag} up`
      : `scripts/sim.sh${flag} frames start`;
  const deadline = Date.now() + waitSeconds * SECOND;
  let last = "";
  for (;;) {
    const answer = await call<{
      granted: boolean;
      waited?: number;
      position?: number;
      queued?: number;
      reason?: string;
    }>(path, { worktree, kind, pid: process.ppid });
    if (answer.granted) {
      if (answer.waited && answer.waited > 5 * SECOND) {
        console.log(`simulator queue: your turn after ${ago(answer.waited)}`);
      }
      return 0;
    }
    const line = `simulator queue: position ${answer.position} of ${answer.queued}${answer.reason ? `, ${answer.reason}` : ""}`;
    if (line !== last) console.log(line);
    last = line;
    if (Date.now() > deadline) {
      console.log(
        `still queued. Run \`${retry}\` again to keep your place; ` +
          "your turn is skipped while nobody is waiting on it, and the place lapses after 5 minutes.",
      );
      return STILL_QUEUED;
    }
    await sleep((path === "/acquire" ? 3 : 1) * SECOND);
  }
}

async function perfStop(worktree: string, kind: Kind) {
  if (!(await connect(false))) return;
  const r = await call<{
    measured: boolean;
    seconds?: number;
    cpu?: number;
    peak?: number;
    overlapped?: boolean;
    expired?: boolean;
  }>("/perf-stop", { worktree, kind });
  if (!r.measured) return;
  let line = `mac: CPU ${r.cpu}% busy on average (peak ${r.peak}%) over ${r.seconds}s`;
  if (r.overlapped) {
    line += `; a device booted during it${r.expired ? ` (it ran past ${ago(PERF_LIMIT)})` : ""}, so measure again`;
  } else {
    line += "; no device booted during it";
  }
  if (!r.overlapped && (r.cpu ?? 0) >= 60) {
    line += ". The Mac was busy with something else; if the report shows slow frames, measure again";
  }
  console.log(line);
}

async function printStatus() {
  if (!(await connect(false))) {
    console.log(
      "simulator queue: not running (it starts with the next `scripts/sim.sh up`)",
    );
    return;
  }
  type Status = {
    version: number;
    memory: Memory;
    config: Config;
    cpu: number;
    leases: (Lease & { usedAt: number; booting: boolean })[];
    perfs: Omit<Perf, "cpu">[];
    waiters: (Waiter & { reason: string })[];
    now: number;
  };
  const s = await call<Status>("/status");
  const { memory, config, now } = s;
  console.log(
    `cpu: ${s.cpu}% busy; memory: ${gb(memory.free)} of ${gb(memory.total)} free, ${memory.pressure} pressure; ` +
      `reserve ${config.reserveGb} GB, ios ${config.iosGb} GB, android ${config.androidGb} GB` +
      `, max ${config.max}, idle after ${config.idleMinutes}m (${config.maxIdleMinutes}m with nobody waiting)`,
  );
  console.log(s.leases.length ? "devices:" : "devices: none");
  for (const lease of s.leases) {
    const state = lease.reclaiming
      ? "shutting down (idle)"
      : !lease.readyAt
        ? `starting (${ago(now - lease.grantedAt)})`
        : lease.booting
          ? `launched ${ago(now - lease.readyAt)} ago, booting until the CPU settles`
          : `up ${ago(now - lease.readyAt)}, last used ${ago(now - lease.usedAt)} ago`;
    console.log(`  ${label(lease)}: ${state}`);
  }
  for (const perf of s.perfs) {
    console.log(`  ${label(perf)}: measuring performance (${ago(now - perf.startedAt)})`);
  }
  console.log(s.waiters.length ? "queue:" : "queue: empty");
  s.waiters.forEach((waiter, i) => {
    console.log(
      `  ${i + 1}. ${describe(waiter)}, waiting ${ago(now - waiter.since)}${waiter.reason ? `: ${waiter.reason}` : ""}`,
    );
  });
  if (s.version !== VERSION) {
    console.log(
      `(the daemon runs queue version ${s.version}; this checkout has ${VERSION}. \`stop\` restarts it on next use.)`,
    );
  }
  console.log(`config: ${CONFIG}; log: ${LOG}`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg.startsWith("--")) flags.set(arg.slice(2), rest[++i] ?? "");
    else positional.push(arg);
  }
  // Only the device commands need it; the daemon runs outside any checkout.
  const worktree = () =>
    flags.get("worktree") ||
    execFileSync("git", ["rev-parse", "--show-toplevel"], {
      encoding: "utf8",
    }).trim();
  const kind = positional[0] as Kind;
  const needKind = () => {
    if (kind !== "ios" && kind !== "android") {
      console.error(
        "usage: simq.ts <acquire|ready|release|perf-start|perf-stop> <ios|android>",
      );
      process.exit(2);
    }
  };
  switch (command) {
    case "daemon":
      daemon();
      return;
    case "acquire":
      needKind();
      process.exit(
        await waitTurn(
          "/acquire",
          worktree(),
          kind,
          Number(flags.get("wait") ?? 540),
        ),
      );
      break;
    case "perf-start":
      needKind();
      process.exit(
        await waitTurn(
          "/perf-start",
          worktree(),
          kind,
          Number(flags.get("wait") ?? 540),
        ),
      );
      break;
    case "perf-stop":
      needKind();
      await perfStop(worktree(), kind);
      return;
    case "ready":
      needKind();
      if (await connect(false)) {
        await call("/ready", {
          worktree: worktree(),
          kind,
          device: flags.get("device") || undefined,
          serial: flags.get("serial") || undefined,
          metroPid: Number(flags.get("metro-pid")) || undefined,
        });
      }
      return;
    case "release":
      needKind();
      if (await connect(false))
        await call("/release", { worktree: worktree(), kind });
      return;
    case "status":
      await printStatus();
      return;
    case "stop":
      if (await connect(false)) await call("/stop");
      return;
    default:
      console.log(
        readFileSync(import.meta.filename, "utf8").split("\nimport ")[0],
      );
      process.exit(2);
  }
}

await main();
