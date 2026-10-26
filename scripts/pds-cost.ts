// What PDS queries and mutations cost on this worktree's Convex deployment
// (an isolated backend, `scripts/backend.sh isolate`), from the function
// logs. Set PDS_TRACE=1 on the deployment first (`npx convex env set
// PDS_TRACE 1` in services/backend), so each log entry says which
// operation it was. See .plans/data-pass.md for how it's used.
//
//   node --experimental-strip-types scripts/pds-cost.ts once <cases.json>
//     Runs each case once, through the PDS router as its account, and
//     prints its cost: documents and bytes read, bytes returned. Cases:
//     [{ "name", "account", "type", "args", "plugin"?, "mutation"? }]
//
//   node --experimental-strip-types scripts/pds-cost.ts live <scenario.json>
//     A headless phone: signs in as `username` (dev sign-in), subscribes
//     to `subscriptions` as the app would, then runs each step and prints
//     what the server ran (by operation) and what the phone received.
//     Scenario: { "username", "subscriptions": [{ "name", "type", "args",
//     "plugin"? }], "steps": [{ "name", "settle"?, "run": [{ "convex":
//     [function, argsJson] } | { "mutation", "args" }] }] }
//
// Add `--json <file>` to save the results.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";

interface LogEvent {
  readonly at: number;
  readonly cachedResult?: boolean;
  readonly caller?: string;
  readonly executionTime?: number;
  readonly identifier: string;
  readonly kind: string;
  readonly logLines?: readonly { readonly messages?: readonly string[] }[];
  readonly returnBytes?: number;
  readonly usageStats?: Record<string, number>;
}

const ROOT = path.resolve(import.meta.dirname, "..");
const BACKEND = path.join(ROOT, "services/backend");
const VERSION = "0.1.0";

function envValue(name: string) {
  const file = readFileSync(path.join(BACKEND, ".env.local"), "utf8");
  const line = file.split("\n").find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/\s*#.*$/, "");
}

const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms));

function request(plugin: string, type: string, args: unknown) {
  return {
    lastChanged: VERSION,
    operation: { args, type },
    plugin,
    version: VERSION,
  };
}

/** Streams the deployment's function logs into `events`. */
function watchLogs() {
  const events: LogEvent[] = [];
  const logs = spawn("npx", ["convex", "logs", "--jsonl", "--success"], {
    cwd: BACKEND,
    stdio: ["ignore", "pipe", "ignore"],
  });
  readline.createInterface({ input: logs.stdout }).on("line", (line) => {
    if (!line.startsWith("{")) return;
    try {
      events.push({ ...JSON.parse(line), at: Date.now() } as LogEvent);
    } catch {
      // Not an event.
    }
  });
  return { events, stop: () => logs.kill() };
}

/** Which operation a router run was for, from its trace (see `trace`). */
function operationOf(event: LogEvent) {
  for (const line of event.logLines ?? []) {
    const parts = (line.messages ?? []).map((part) =>
      part.replace(/^'|'$/g, ""),
    );
    if (parts[0] !== "pds") continue;
    const [, kind, plugin, type, shape] = parts;
    const args = Object.entries(JSON.parse(shape ?? "{}") as object)
      .filter(([name]) => name !== "conversationId" && name !== "accountId")
      .map(([name, value]) =>
        typeof value === "number" ? `${name}[${String(value)}]` : name,
      );
    return `${kind === "query" ? "q" : "m"} ${plugin ?? ""}.${type ?? ""}(${args.join(",")})`;
  }
  return event.identifier;
}

interface Cost {
  docs: number;
  readKB: number;
  returnKB: number;
  runs: number;
  writes: number;
}

function costOf(events: readonly LogEvent[]) {
  const byOperation = new Map<string, Cost>();
  for (const event of events) {
    if (event.kind !== "Completion") continue;
    const key = `${event.cachedResult === true ? "[cached] " : ""}${operationOf(event)}`;
    const usage = event.usageStats ?? {};
    const cost = byOperation.get(key) ?? {
      docs: 0,
      readKB: 0,
      returnKB: 0,
      runs: 0,
      writes: 0,
    };
    cost.runs += 1;
    cost.docs += usage.databaseReadDocuments ?? 0;
    cost.writes += usage.databaseWriteDocuments ?? 0;
    cost.readKB += (usage.databaseReadBytes ?? 0) / 1024;
    cost.returnKB += (event.returnBytes ?? 0) / 1024;
    byOperation.set(key, cost);
  }
  return byOperation;
}

function printCosts(byOperation: Map<string, Cost>) {
  for (const [key, cost] of [...byOperation].sort(
    (left, right) => right[1].docs - left[1].docs,
  )) {
    console.log(
      `  ${key}: runs=${String(cost.runs)} docs=${String(cost.docs)} writes=${String(cost.writes)} readKB=${cost.readKB.toFixed(1)} returnKB=${cost.returnKB.toFixed(1)}`,
    );
  }
}

interface Case {
  readonly account: string;
  readonly args?: unknown;
  readonly mutation?: boolean;
  readonly name: string;
  readonly plugin?: string;
  readonly type: string;
}

/** Runs each case once, as its account, and reports its cost. */
async function once(cases: readonly Case[]) {
  const logs = watchLogs();
  await sleep(6000);
  const results = [];
  for (const entry of cases) {
    const fn =
      entry.mutation === true ? "pds:dispatchMutation" : "pds:dispatchQuery";
    // A new token identifier each time, so Convex's cache doesn't answer.
    const identity = {
      accountId: entry.account,
      issuer: "vera-dev",
      name: "Perf",
      subject: entry.account,
      tokenIdentifier: `vera-dev|${entry.account}|${crypto.randomUUID()}`,
    };
    const before = logs.events.length;
    const output = execFileSync(
      "npx",
      [
        "convex",
        "run",
        fn,
        JSON.stringify(
          request(entry.plugin ?? "messages", entry.type, entry.args ?? {}),
        ),
        "--identity",
        JSON.stringify(identity),
        "--typecheck",
        "disable",
        "--codegen",
        "disable",
      ],
      { cwd: BACKEND, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    let event: LogEvent | undefined;
    for (let tries = 0; tries < 40 && event === undefined; tries += 1) {
      event = logs.events
        .slice(before)
        .findLast(
          (candidate) =>
            candidate.kind === "Completion" &&
            candidate.identifier === fn &&
            candidate.caller === "HttpApi",
        );
      if (event === undefined) await sleep(500);
    }
    const value: unknown = output.trim() === "" ? null : JSON.parse(output);
    const included: unknown = Reflect.get(Object(value), "included");
    const usage = event?.usageStats ?? {};
    const result = {
      docs: usage.databaseReadDocuments,
      included: Array.isArray(included) ? included.length : 0,
      ms: Math.round((event?.executionTime ?? 0) * 1000),
      name: entry.name,
      readKB: Math.round((usage.databaseReadBytes ?? 0) / 102.4) / 10,
      returnKB: Math.round((event?.returnBytes ?? 0) / 102.4) / 10,
      writes: usage.databaseWriteDocuments,
    };
    results.push(result);
    console.log(JSON.stringify(result));
  }
  logs.stop();
  return results;
}

interface Subscription {
  readonly args: Record<string, unknown>;
  /** A page that, once full, is followed by the next, as the app does. */
  readonly follow?: boolean;
  /** False: subscribed without what it includes, as apps now do. */
  readonly include?: boolean;
  readonly name: string;
  readonly plugin?: string;
  readonly type: string;
}

interface Scenario {
  readonly steps: readonly {
    readonly name: string;
    readonly run?: readonly (
      | { readonly convex: readonly string[] }
      | { readonly args: unknown; readonly mutation: string }
    )[];
    readonly settle?: number;
  }[];
  readonly subscriptions: readonly Subscription[];
  readonly username: string;
}

async function signIn(site: string, username: string) {
  const response = await fetch(`${site}/api/auth/dev/sign-in`, {
    body: JSON.stringify({ username }),
    headers: { "content-type": "application/json", origin: site },
    method: "POST",
  });
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  const token = await fetch(`${site}/api/auth/convex/token`, {
    headers: { cookie, origin: site },
  });
  return ((await token.json()) as { token: string }).token;
}

/** Subscribes as the app would and reports what each step cost. */
async function live(scenario: Scenario) {
  const site = envValue("CONVEX_SITE_URL");
  const url = envValue("CONVEX_URL");
  if (site === undefined || url === undefined) {
    throw new Error("No CONVEX_URL in services/backend/.env.local");
  }
  const require = createRequire(path.join(BACKEND, "package.json"));
  const { ConvexClient } =
    require("convex/browser") as typeof import("convex/browser");
  const logs = watchLogs();
  const token = await signIn(site, scenario.username);
  const client = new ConvexClient(url, { logger: false });
  client.setAuth(() => Promise.resolve(token));
  let phase = "setup";
  const received: { bytes: number; name: string; phase: string }[] = [];
  function subscribe(subscription: Subscription) {
    const { args, follow, include, name, plugin, type } = subscription;
    let followed = false;
    client.onUpdate(
      "pds:dispatchQuery" as never,
      {
        ...request(plugin ?? "messages", type, args),
        ...(include === false ? { include: false } : {}),
      } as never,
      (result: unknown) => {
        received.push({ bytes: JSON.stringify(result).length, name, phase });
        const page = Reflect.get(Object(result), "value") as
          | { hasNewer?: boolean; messages?: { sentAt: number }[] }
          | undefined;
        const newest = page?.messages?.at(-1);
        if (follow !== true || followed || page?.hasNewer !== true) return;
        if (newest === undefined) return;
        followed = true;
        subscribe({
          ...subscription,
          args: { ...args, after: newest.sentAt - 1 },
        });
      },
      (error: Error) => console.error(name, error.message),
    );
  }
  for (const subscription of scenario.subscriptions) subscribe(subscription);
  await sleep(8000);
  const phases = [];
  for (const step of scenario.steps) {
    phase = step.name;
    const start = Date.now();
    for (const command of step.run ?? []) {
      if ("mutation" in command) {
        await client.mutation(
          "pds:dispatchMutation" as never,
          request("messages", command.mutation, command.args) as never,
        );
      } else {
        execFileSync("npx", ["convex", "run", ...command.convex], {
          cwd: BACKEND,
          stdio: "ignore",
        });
      }
    }
    await sleep(step.settle ?? 6000);
    phases.push({ end: Date.now(), name: step.name, start });
  }
  await sleep(3000);
  logs.stop();
  await client.close();
  const report = phases.map(({ end, name, start }) => {
    const costs = costOf(
      logs.events.filter((event) => event.at >= start && event.at < end),
    );
    const phone = new Map<string, { KB: number; updates: number }>();
    for (const entry of received.filter((item) => item.phase === name)) {
      const sum = phone.get(entry.name) ?? { KB: 0, updates: 0 };
      sum.updates += 1;
      sum.KB += entry.bytes / 1024;
      phone.set(entry.name, sum);
    }
    return { costs, name, phone, seconds: Math.round((end - start) / 1000) };
  });
  for (const { costs, name, phone, seconds } of report) {
    const total = [...costs]
      .filter(([key]) => !key.startsWith("[cached]"))
      .reduce(
        (sum, [, cost]) => ({
          docs: sum.docs + cost.docs,
          returnKB: sum.returnKB + cost.returnKB,
          runs: sum.runs + cost.runs,
        }),
        { docs: 0, returnKB: 0, runs: 0 },
      );
    const phoneKB = [...phone.values()].reduce((sum, { KB }) => sum + KB, 0);
    console.log(
      `\n## ${name} (${String(seconds)}s): runs=${String(total.runs)} docs=${String(total.docs)} returnKB=${total.returnKB.toFixed(1)}; phone received ${phoneKB.toFixed(1)} KB`,
    );
    printCosts(costs);
    console.log(
      "  phone:",
      [...phone]
        .map(
          ([key, { KB, updates }]) =>
            `${key}×${String(updates)} (${KB.toFixed(1)} KB)`,
        )
        .join(", "),
    );
  }
  return report.map(({ costs, name, phone, seconds }) => ({
    costs: Object.fromEntries(costs),
    name,
    phone: Object.fromEntries(phone),
    seconds,
  }));
}

const [mode, file, flag, out] = process.argv.slice(2);
if (file === undefined || (mode !== "once" && mode !== "live")) {
  console.error("usage: pds-cost.ts once|live <file.json> [--json <out.json>]");
  process.exit(1);
}
const input: unknown = JSON.parse(readFileSync(file, "utf8"));
const results =
  mode === "once" ? await once(input as Case[]) : await live(input as Scenario);
if (flag === "--json" && out !== undefined) {
  writeFileSync(out, JSON.stringify(results, null, 1));
}
process.exit(0);
