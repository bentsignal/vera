// The simulator queue. Every worktree that runs `scripts/sim.sh up` asks it
// for a slot first, and it admits simulators and emulators one at a time,
// only while the Mac has free memory for another. Many agents can then ask
// at once without slowing the machine to a crawl. scripts/sim.sh is the
// only caller; the daemon starts on first use and exits after ten idle
// minutes. `VERA_SIMQ=off scripts/sim.sh up` skips it.
//
//   node --experimental-strip-types scripts/simq.ts <command> [--worktree <path>]
//
//   acquire <ios|android> [--wait <seconds>]   wait for a slot; exit 75 means still queued, run again
//   ready <ios|android> [--device <id>] [--serial <serial>] [--metro-pid <pid>]
//                                               the device is up, so memory can be measured again
//   release <ios|android>                       give the slot back
//   status                                      slots, the queue, memory, and the config in effect
//   stop                                        stop the daemon (slots persist in state.json)
//   daemon                                      run the daemon in the foreground
//
// Admission, in order: one device starts at a time (the next waits until
// the last one has launched, plus a few seconds for memory to settle); the
// first device always gets in; then the queue's head gets in only if
// memory pressure is normal and free memory covers its estimate plus a
// reserve. When the head can't get in, a device nobody has used for
// `idleMinutes` is shut down to make room. Tune it in ~/.config/vera/simq.json:
//
//   { "reserveGb": 5, "iosGb": 3, "androidGb": 4, "max": 6, "idleMinutes": 20 }
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
import { freemem, homedir, platform, totalmem } from "node:os";
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
  reclaiming?: boolean;
  // Its sim.sh couldn't run; never picked for reclaiming again.
  reclaimFailed?: boolean;
};
type Waiter = {
  worktree: string;
  kind: Kind;
  pid: number;
  since: number;
  seenAt: number;
};
type Config = {
  reserveGb: number;
  iosGb: number;
  androidGb: number;
  max?: number;
  idleMinutes: number;
};
type Memory = {
  total: number;
  free: number;
  pressure: "normal" | "warn" | "critical";
};

const VERSION = 1;
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
const START_LIMIT = 5 * MINUTE;
const SETTLE = 15 * SECOND;
// A waiter that stops polling loses its turn to the next one after this,
// and its place in line after WAITER_TIMEOUT.
const ACTIVE = 10 * SECOND;
const WAITER_TIMEOUT = 5 * MINUTE;
const IDLE_EXIT = 10 * MINUTE;

const key = (worktree: string, kind: Kind) => `${worktree}#${kind}`;
const label = (x: { worktree: string; kind: Kind }) =>
  `${basename(x.worktree)} ${x.kind}`;
const gb = (bytes: number) => `${(bytes / GB).toFixed(1)} GB`;
const ago = (ms: number) =>
  ms < MINUTE ? `${Math.round(ms / SECOND)}s` : `${Math.round(ms / MINUTE)}m`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function readConfig(): Config {
  const defaults: Config = {
    reserveGb: Math.max(4, Math.round((totalmem() / GB) * 0.15 * 10) / 10),
    iosGb: 3,
    androidGb: 4,
    idleMinutes: 20,
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
      leases.set(key(lease.worktree, lease.kind), lease);
    }
  } catch {
    // No saved slots.
  }
  const waiters: Waiter[] = [];
  // Why the queue's head is waiting, for status and for the waiters.
  let blocked = "";
  let idleSince = Date.now();
  // When a device last started or was shut down to make room; memory is
  // measured again only after it settles.
  let changedAt = 0;

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
      if (
        now - waiter.seenAt > WAITER_TIMEOUT ||
        leases.has(key(waiter.worktree, waiter.kind))
      ) {
        waiters.splice(i, 1);
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

  // Shuts down the device nobody has used for longest, through its own
  // worktree's sim.sh so its state stays consistent, and leaves a note that
  // the worktree's next sim.sh command prints.
  function reclaimIdle(now: number, config: Config) {
    if ([...leases.values()].some((lease) => lease.reclaiming)) return true;
    const idle = [...leases.values()]
      .filter((lease) => lease.readyAt && !lease.reclaimFailed)
      .map((lease) => ({
        lease,
        usedAt: deviceState(lease.worktree, lease.kind).usedAt,
      }))
      .filter(({ usedAt }) => now - usedAt > config.idleMinutes * MINUTE)
      .sort((a, b) => a.usedAt - b.usedAt)[0];
    if (!idle) return false;
    const { lease } = idle;
    lease.reclaiming = true;
    log(
      `shutting down ${label(lease)}, unused for ${ago(now - idle.usedAt)}, to make room`,
    );
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
          `The simulator queue shut this ${lease.kind} device down after ${config.idleMinutes} unused minutes so another worktree could start one. Run \`scripts/sim.sh${lease.kind === "android" ? " --android" : ""} up\` to get it back.\n`,
        );
      } catch {
        // The worktree is gone.
      }
      changedAt = Date.now();
      if (leases.get(key(lease.worktree, lease.kind)) === lease)
        drop(lease, "shut down while idle");
    });
    child.on("error", (error) => {
      log(`couldn't shut down ${label(lease)}: ${String(error)}`);
      lease.reclaiming = false;
      lease.reclaimFailed = true;
    });
    return true;
  }

  function admit(now: number) {
    blocked = "";
    if (waiters.length === 0) return;
    const config = readConfig();
    const all = [...leases.values()];
    const starting = all.find(
      (lease) => !lease.readyAt && now - lease.grantedAt < START_LIMIT,
    );
    if (starting) {
      blocked = `${label(starting)} is starting; devices start one at a time`;
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
    const head = waiters.find(
      (waiter) => now - waiter.seenAt < ACTIVE && alive(waiter.pid),
    );
    if (!head) return;
    if (all.length > 0) {
      const memory = readMemory();
      const need =
        ((head.kind === "ios" ? config.iosGb : config.androidGb) +
          config.reserveGb) *
        GB;
      if (config.max && all.length >= config.max) {
        blocked = `${all.length} devices are up, the configured max`;
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
  }

  function tick() {
    const now = Date.now();
    reap(now);
    admit(now);
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
      leases: [...leases.values()].map((lease) => ({
        ...lease,
        usedAt: deviceState(lease.worktree, lease.kind).usedAt,
      })),
      waiters: waiters.map((waiter, i) => ({
        ...waiter,
        reason: i === 0 ? blocked : "",
      })),
      now,
    };
  }

  type Body = { worktree: string; kind: Kind; pid?: number } & Device;
  const routes: Record<string, (body: Body) => unknown> = {
    "/acquire": ({ worktree, kind, pid = 0 }) => {
      const now = Date.now();
      const id = key(worktree, kind);
      const lease = leases.get(id);
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
      let waiter = waiters.find((w) => key(w.worktree, w.kind) === id);
      if (!waiter) {
        waiter = { worktree, kind, pid, since: now, seenAt: now };
        waiters.push(waiter);
        log(`queued ${label(waiter)}`);
      }
      waiter.seenAt = now;
      waiter.pid = pid;
      admit(now);
      if (leases.has(id)) return { granted: true, waited: now - waiter.since };
      const position = waiters.indexOf(waiter) + 1;
      return {
        granted: false,
        position,
        queued: waiters.length,
        reason: position === 1 ? blocked : `behind ${label(waiters[0]!)}`,
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
    await call("/status");
    return true;
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

async function acquire(worktree: string, kind: Kind, waitSeconds: number) {
  if (!(await connect(true))) {
    console.error(
      `the simulator queue didn't start (see ${LOG}); going ahead without it`,
    );
    return 0;
  }
  const deadline = Date.now() + waitSeconds * SECOND;
  let last = "";
  for (;;) {
    const answer = await call<{
      granted: boolean;
      waited?: number;
      position?: number;
      queued?: number;
      reason?: string;
    }>("/acquire", { worktree, kind, pid: process.ppid });
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
        `still queued. Run \`scripts/sim.sh${kind === "android" ? " --android" : ""} up\` again to keep your place; ` +
          "your turn is skipped while nobody is waiting on it, and the place lapses after 5 minutes.",
      );
      return STILL_QUEUED;
    }
    await sleep(3 * SECOND);
  }
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
    leases: (Lease & { usedAt: number })[];
    waiters: (Waiter & { reason: string })[];
    now: number;
  };
  const s = await call<Status>("/status");
  const { memory, config, now } = s;
  console.log(
    `memory: ${gb(memory.free)} of ${gb(memory.total)} free, ${memory.pressure} pressure; ` +
      `reserve ${config.reserveGb} GB, ios ${config.iosGb} GB, android ${config.androidGb} GB` +
      `${config.max ? `, max ${config.max}` : ""}, idle after ${config.idleMinutes}m`,
  );
  console.log(s.leases.length ? "devices:" : "devices: none");
  for (const lease of s.leases) {
    const state = lease.reclaiming
      ? "shutting down (idle)"
      : lease.readyAt
        ? `up ${ago(now - lease.readyAt)}, last used ${ago(now - lease.usedAt)} ago`
        : `starting (${ago(now - lease.grantedAt)})`;
    console.log(`  ${label(lease)}: ${state}`);
  }
  console.log(s.waiters.length ? "queue:" : "queue: empty");
  s.waiters.forEach((waiter, i) => {
    console.log(
      `  ${i + 1}. ${label(waiter)}, waiting ${ago(now - waiter.since)}${waiter.reason ? `: ${waiter.reason}` : ""}`,
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
      console.error("usage: simq.ts <acquire|ready|release> <ios|android>");
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
        await acquire(worktree(), kind, Number(flags.get("wait") ?? 540)),
      );
      break;
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
