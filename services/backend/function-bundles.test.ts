import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// What runs on every request to this PDS stays small. Convex loads all the
// code a function's module imports each time the function runs, so a
// module's import graph is part of every call's latency: the PDS router
// once imported the assistants' model code through its `afterMutation`
// hook (1.6 MB), which added 100–350 ms to every query and mutation. See
// docs/architecture.md, "Function bundles".

const KB = 1024;

/** The modules every PDS request loads, and how big each may get. */
const BUDGETS = [
  { budget: 100 * KB, entry: "convex/pds.ts", name: "PDS router" },
  {
    budget: 200 * KB,
    entry: "../../packages/decentralized-convex-messages/dispatcher.ts",
    name: "messages plugin",
  },
  {
    budget: 100 * KB,
    entry: "../../packages/decentralized-convex-accounts/dispatcher.ts",
    name: "accounts plugin",
  },
] as const;

/** The packages (or files) that take the most of a bundle, largest first. */
function largest(inputs: Record<string, { bytesInOutput: number }>) {
  const sizes = new Map<string, number>();
  for (const [path, { bytesInOutput }] of Object.entries(inputs)) {
    const parts = path.split("node_modules/");
    const tail = parts.at(-1) ?? path;
    const segments = tail.split("/");
    const name =
      parts.length === 1
        ? path
        : tail.startsWith("@")
          ? segments.slice(0, 2).join("/")
          : (segments[0] ?? tail);
    sizes.set(name, (sizes.get(name) ?? 0) + bytesInOutput);
  }
  return [...sizes]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, bytes]) => `${name} ${Math.round(bytes / KB)} KB`)
    .join(", ");
}

for (const { budget, entry, name } of BUDGETS) {
  void test(`the ${name} stays under ${budget / KB} KB bundled`, async () => {
    const result = await build({
      bundle: true,
      conditions: ["convex", "module"],
      entryPoints: [fileURLToPath(new URL(entry, import.meta.url))],
      external: ["node:*"],
      format: "esm",
      logLevel: "silent",
      metafile: true,
      minify: true,
      platform: "browser",
      write: false,
    });
    const [output] = Object.values(result.metafile.outputs);
    assert.ok(output);
    assert.ok(
      output.bytes <= budget,
      `${entry} bundles to ${Math.round(output.bytes / KB)} KB, over its ${budget / KB} KB budget. ` +
        `Largest: ${largest(output.inputs)}. Move what it doesn't need on every ` +
        "request behind a function it calls by reference (docs/architecture.md).",
    );
  });
}
