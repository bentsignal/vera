// CI check for every PR (.github/workflows/release-steps.yml): the
// description's Release notes must say whether merging adds steps the next
// release has to do beyond `pnpm release` (deploys outside Convex, console
// or account setup, environment variables, ordering, checks after
// shipping). Steps go in docs/next-release.md in the same PR, which the
// release agent is required to work through, so nothing depends on someone
// remembering to pass it on.
//
//   PR_BODY="..." BASE_SHA=<sha> node --experimental-strip-types scripts/check-release-steps.ts
import { execFileSync } from "node:child_process";

const CHECKLIST = "docs/next-release.md";
// Nothing in `pnpm release` deploys these, so a change to them always needs
// a step.
const UNRELEASED_PATHS = ["infra/"];

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
