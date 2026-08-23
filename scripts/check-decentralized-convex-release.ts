import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";

import {
  DECENTRALIZED_CONVEX_RELEASES,
  DECENTRALIZED_CONVEX_VERSION,
} from "../packages/decentralized-convex-core/src/release.ts";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const packagesRoot = `${repoRoot}packages`;
const problems: string[] = [];
const packageDirectories = (await readdir(packagesRoot, {
  withFileTypes: true,
}))
  .filter(
    (entry) =>
      entry.isDirectory() && entry.name.startsWith("decentralized-convex-"),
  )
  .map((entry) => entry.name);

for (const directory of packageDirectories) {
  const packageRoot = `${packagesRoot}/${directory}`;
  const manifest = await readJson(`${packageRoot}/package.json`);
  const packageName = manifest.name ?? directory;

  if (manifest.version !== DECENTRALIZED_CONVEX_VERSION) {
    problems.push(
      `${String(packageName)} is ${String(manifest.version)}, expected ${DECENTRALIZED_CONVEX_VERSION}`,
    );
  }

  const exports = manifest.exports;
  if (!isRecord(exports) || exports["./metadata"] !== "./metadata.ts") {
    problems.push(
      `${String(packageName)} must export ./metadata from ./metadata.ts`,
    );
  }

  const metadata = await readPackageMetadata(`${packageRoot}/metadata.ts`);
  if (metadata.name !== packageName) {
    problems.push(
      `${String(packageName)} metadata identifies itself as ${String(metadata.name)}`,
    );
  }
  if (metadata.version !== DECENTRALIZED_CONVEX_VERSION) {
    problems.push(
      `${String(packageName)} metadata reports ${String(metadata.version)}, expected ${DECENTRALIZED_CONVEX_VERSION}`,
    );
  }
  if (
    !DECENTRALIZED_CONVEX_RELEASES.some(
      (release) => release === metadata.lastChanged,
    )
  ) {
    problems.push(
      `${String(packageName)} last changed in unknown release ${String(metadata.lastChanged)}`,
    );
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

if (
  DECENTRALIZED_CONVEX_RELEASES.at(-1) !== DECENTRALIZED_CONVEX_VERSION
) {
  problems.push("the current version is not the latest known release");
}

if (problems.length > 0) {
  throw new Error(
    `Decentralized Convex release drift:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

console.log(
  `Decentralized Convex ${DECENTRALIZED_CONVEX_VERSION}: ${packageDirectories.length} package metadata exports and internal dependencies are in sync.`,
);

async function readJson(path: string): Promise<Record<string, unknown>> {
  const value: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!isRecord(value)) throw new Error(`${path} is not a JSON object`);
  return value;
}

async function readPackageMetadata(path: string) {
  const module: unknown = await import(pathToFileURL(path).href);
  if (!isRecord(module) || !isRecord(module.decentralizedConvexPackage)) {
    throw new Error(
      `${path} must export a decentralizedConvexPackage metadata object`,
    );
  }
  return module.decentralizedConvexPackage;
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
