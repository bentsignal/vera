// CI check for every PR (.github/workflows/release-steps.yml): the
// description's Release notes must say whether merging adds steps the next
// release has to do beyond `pnpm release` (deploys outside Convex, console
// or account setup, environment variables, ordering, checks after
// shipping). Steps go in docs/next-release.md in the same PR, which the
// release agent is required to work through, so nothing depends on someone
// remembering to pass it on.
//
// It also checks the "Breaking backend change" line against
// services/backend/breaking-version.ts: "yes" exactly when the PR raises
// BREAKING_VERSION, by one. The workflow labels such PRs
// "💥 Breaking Backend".
//
// And the "Native change" line against RUNTIME_VERSION in
// apps/mobile/app.config.ts: "yes, new runtime" exactly when the PR raises a
// platform's runtime version (older binaries stop getting updates; the
// workflow labels it "⛔ New Runtime"). Whether native code changed at all
// takes the fingerprint, which the Mobile fingerprint workflow checks.
//
//   PR_BODY="..." BASE_SHA=<sha> node --experimental-strip-types scripts/check-release-steps.ts
import { execFileSync, spawnSync } from "node:child_process";

const CHECKLIST = "docs/next-release.md";
// Nothing in `pnpm release` deploys these, so a change to them always needs
// a step.
const UNRELEASED_PATHS = ["infra/"];
const BREAKING_FILE = "services/backend/breaking-version.ts";
const APP_CONFIG = "apps/mobile/app.config.ts";

function fail(message: string): never {
  console.error(`release steps: ${message}`);
  process.exit(1);
}

const body = process.env.PR_BODY ?? "";
const base = process.env.BASE_SHA;
if (base === undefined || base === "") fail("BASE_SHA is not set");

const line = /^\s*-\s*Extra release steps:(.*)$/im.exec(body);
if (line === null) {
  fail(
    'the description\'s Release notes need a "- Extra release steps:" line (see .github/pull_request_template.md): "none", or what this adds to docs/next-release.md.',
  );
}
const value = (line[1] ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
if (value === "") {
  fail(
    '"Extra release steps:" is empty. Write "none", or add the steps to docs/next-release.md and say so.',
  );
}

const changed = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
  encoding: "utf8",
})
  .split("\n")
  .filter(Boolean);
const addsSteps = changed.includes(CHECKLIST);
const none = /^none\b/i.test(value);

if (!none && !addsSteps) {
  fail(
    `this PR says it has extra release steps ("${value}") but doesn't change ${CHECKLIST}. Add them there, with when to do each and how to verify it.`,
  );
}
const unreleased = changed.filter((file) =>
  UNRELEASED_PATHS.some((path) => file.startsWith(path)),
);
if (unreleased.length > 0 && !addsSteps) {
  fail(
    `${unreleased.join(", ")} ${unreleased.length === 1 ? "isn't" : "aren't"} deployed by \`pnpm release\`. Add the deploy to ${CHECKLIST}.`,
  );
}
console.log(
  `release steps: ${none ? "none" : value}${addsSteps ? ` (${CHECKLIST} changed)` : ""}`,
);

/** BREAKING_VERSION in a commit, if the file has it there. */
function breakingVersionAt(ref: string) {
  const source = spawnSync("git", ["show", `${ref}:${BREAKING_FILE}`], {
    encoding: "utf8",
  }).stdout;
  const version = /BREAKING_VERSION = (\d+)/.exec(source)?.[1];
  return version === undefined ? undefined : Number(version);
}

const breakingLine = /^\s*-\s*Breaking backend change:(.*)$/im.exec(body);
if (breakingLine === null) {
  fail(
    'the description\'s Release notes need a "- Breaking backend change:" line (see .github/pull_request_template.md): "no", or "yes" when this raises BREAKING_VERSION.',
  );
}
const breakingValue = (breakingLine[1] ?? "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .trim();
const saysBreaking = /^yes\b/i.test(breakingValue);
if (!saysBreaking && !/^no\b/i.test(breakingValue)) {
  fail('"Breaking backend change:" must start with "no" or "yes".');
}
const before = breakingVersionAt(base);
const after = breakingVersionAt("HEAD");
const raised = before !== undefined && after !== before;
if (raised && after !== before + 1) {
  fail(
    `BREAKING_VERSION goes from ${String(before)} to ${String(after)}; it only ever goes up by one.`,
  );
}
if (raised && !saysBreaking) {
  fail(
    `this PR raises BREAKING_VERSION to ${String(after)}, so "Breaking backend change:" must say yes, and why the backend change can't stay compatible.`,
  );
}
if (saysBreaking && !raised) {
  fail(
    `"Breaking backend change:" says yes, but ${BREAKING_FILE} isn't raised. Raise BREAKING_VERSION by one, or make the change compatible with the app before it and say no.`,
  );
}
console.log(`breaking backend change: ${saysBreaking ? breakingValue : "no"}`);

/**
 * A platform's runtime version in a commit's app.config.ts
 * (`RUNTIME_VERSION`), if it sets one there.
 */
function runtimeVersionAt(ref: string, platform: "android" | "ios") {
  const source = spawnSync("git", ["show", `${ref}:${APP_CONFIG}`], {
    encoding: "utf8",
  }).stdout;
  const block = /const RUNTIME_VERSION = \{([\s\S]*?)\};/.exec(source)?.[1];
  return new RegExp(`${platform}: "([^"]+)"`).exec(block ?? "")?.[1];
}

const nativeLine = /^\s*-\s*Native change:(.*)$/im.exec(body);
if (nativeLine === null) {
  fail(
    'the description\'s Release notes need a "- Native change:" line (see .github/pull_request_template.md): "no", "yes, compatible", or "yes, new runtime".',
  );
}
const nativeValue = (nativeLine[1] ?? "")
  .replace(/<!--[\s\S]*?-->/g, "")
  .trim();
const saysNewRuntime = /^yes,?\s*new runtime\b/i.test(nativeValue);
if (
  !saysNewRuntime &&
  !/^no\b/i.test(nativeValue) &&
  !/^yes,?\s*compatible\b/i.test(nativeValue)
) {
  fail(
    '"Native change:" must start with "no", "yes, compatible" (older binaries still run this JavaScript), or "yes, new runtime" (this raises RUNTIME_VERSION in app.config.ts).',
  );
}
const raisedRuntimes = (["ios", "android"] as const).filter((platform) => {
  const before = runtimeVersionAt(base, platform);
  // Its first appearance raises nothing: the values were the binaries' own.
  return before !== undefined && runtimeVersionAt("HEAD", platform) !== before;
});
if (raisedRuntimes.length > 0 && !saysNewRuntime) {
  fail(
    `this PR raises the ${raisedRuntimes.join(" and ")} runtime version, so "Native change:" must say "yes, new runtime", and what this JavaScript needs from native that older binaries lack.`,
  );
}
if (saysNewRuntime && raisedRuntimes.length === 0) {
  fail(
    `"Native change:" says "yes, new runtime", but RUNTIME_VERSION in ${APP_CONFIG} isn't raised. Raise the runtime version of each platform whose older binaries can't run this JavaScript, or say "yes, compatible".`,
  );
}
console.log(`native change: ${nativeValue}`);
