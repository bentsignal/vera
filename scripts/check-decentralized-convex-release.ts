import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_RELEASES,
  DECENTRALIZED_CONVEX_VERSION,
} from "../packages/decentralized-convex-core/src/index.ts";

const packages = {
  accounts: "decentralized-convex-accounts",
  address: "decentralized-convex-address",
  client: "decentralized-convex-client",
  core: "decentralized-convex-core",
  messages: "decentralized-convex-messages",
  plugin: "decentralized-convex-plugin",
  react: "decentralized-convex-react",
  server: "decentralized-convex-server",
  tanstackQuery: "decentralized-convex-tanstack-query",
} as const;

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const problems: string[] = [];

for (const [part, directory] of Object.entries(packages)) {
  const manifest = await readJson(`${repoRoot}packages/${directory}/package.json`);
  if (manifest.version !== DECENTRALIZED_CONVEX_VERSION) {
    problems.push(
      `${manifest.name ?? directory} is ${String(manifest.version)}, expected ${DECENTRALIZED_CONVEX_VERSION}`,
    );
  }
  if (!(part in DECENTRALIZED_CONVEX_LAST_CHANGED)) {
    problems.push(`${part} is missing lastChanged metadata`);
  }

}

for (const root of ["apps", "packages", "services", "shared", "tooling"]) {
  for (const entry of await readdir(`${repoRoot}${root}`, {
    withFileTypes: true,
  })) {
    if (!entry.isDirectory()) continue;
    const manifest = await readJson(
      `${repoRoot}${root}/${entry.name}/package.json`,
    );
    checkInternalDependencyRanges(manifest);
  }
}

if (!("protocol" in DECENTRALIZED_CONVEX_LAST_CHANGED)) {
  problems.push("protocol is missing lastChanged metadata");
}
if (
  DECENTRALIZED_CONVEX_RELEASES.at(-1) !== DECENTRALIZED_CONVEX_VERSION
) {
  problems.push("the current version is not the latest known release");
}
for (const [part, lastChanged] of Object.entries(
  DECENTRALIZED_CONVEX_LAST_CHANGED,
)) {
  if (!DECENTRALIZED_CONVEX_RELEASES.includes(lastChanged)) {
    problems.push(`${part} last changed in unknown release ${lastChanged}`);
  }
}

if (problems.length > 0) {
  throw new Error(
    `Decentralized Convex release drift:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

console.log(
  `Decentralized Convex ${DECENTRALIZED_CONVEX_VERSION}: package versions and internal dependencies are in sync.`,
);

async function readJson(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value)) throw new Error(`${path} is not a JSON object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function checkInternalDependencyRanges(manifest: Record<string, unknown>) {
  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (!isRecord(dependencies)) continue;
    for (const [name, range] of Object.entries(dependencies)) {
      if (
        name.startsWith("@decentralized-convex/") &&
        range !== `workspace:${DECENTRALIZED_CONVEX_VERSION}`
      ) {
        problems.push(
          `${String(manifest.name)} declares ${name} as ${String(range)}, expected workspace:${DECENTRALIZED_CONVEX_VERSION}`,
        );
      }
    }
  }
}
