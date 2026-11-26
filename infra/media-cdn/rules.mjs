#!/usr/bin/env node
// Sets the edge rules on a bunny.net pull zone that serves Vera's media, so
// a browser shows only pictures, video, audio and PDFs from it and
// downloads everything else as a file. The app uploads straight to bunny Storage,
// which keeps whatever Content-Type the upload sent, so the rules go by the
// type the CDN serves, and fail safe: a type not on the list downloads.
//
//   node infra/media-cdn/rules.mjs <pull zone name>          # show the plan
//   node infra/media-cdn/rules.mjs <pull zone name> --apply  # set the rules
//
// Uses the bunny CLI's login (`bunny api`). Running it again replaces the
// rules it set before (matched by description) and leaves others alone.
import { execFileSync } from "node:child_process";

/** Types a browser may show inline. SVG is left out: it can run scripts. */
export const INLINE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
  "video/*",
  "audio/*",
];

// bunny.net's edge rule enums.
const ACTION = { forceDownload: 7, setResponseHeader: 5 };
const TRIGGER = { responseHeader: 2, url: 0 };
const MATCH = { all: 1, any: 0, none: 2 };
/** bunny.net takes at most five patterns in one trigger. */
const PATTERNS_PER_TRIGGER = 5;

function chunks(list, size) {
  return Array.from({ length: Math.ceil(list.length / size) }, (_, index) =>
    list.slice(index * size, (index + 1) * size),
  );
}

const TAG = "vera-media:";

const CONTENT_TYPE = { Parameter1: "Content-Type", Type: TRIGGER.responseHeader };
const SANDBOX = "sandbox; default-src 'none'";

const DOWNLOAD = {
  ActionParameter1: "",
  ActionParameter2: "",
  ActionType: ACTION.forceDownload,
  Enabled: true,
};

export const RULES = [
  {
    // A file's type is never guessed from its contents.
    ActionParameter1: "X-Content-Type-Options",
    ActionParameter2: "nosniff",
    ActionType: ACTION.setResponseHeader,
    Description: `${TAG} no type guessing`,
    Enabled: true,
    TriggerMatchingType: MATCH.any,
    Triggers: [
      { PatternMatches: ["*"], PatternMatchingType: MATCH.any, Type: TRIGGER.url },
    ],
  },
  {
    // Whatever a browser shows from here runs no scripts and can't act as
    // a Vera page. PDFs are left out: Chrome won't show a sandboxed PDF,
    // and its viewer keeps a PDF's own scripts away from the page.
    ActionParameter1: "Content-Security-Policy",
    ActionParameter2: SANDBOX,
    ActionType: ACTION.setResponseHeader,
    Description: `${TAG} no scripts`,
    Enabled: true,
    TriggerMatchingType: MATCH.any,
    Triggers: [
      { ...CONTENT_TYPE, PatternMatches: ["application/pdf*"], PatternMatchingType: MATCH.none },
    ],
  },
  {
    ...DOWNLOAD,
    Description: `${TAG} download anything but pictures, video, audio and PDFs`,
    // None of the types in any trigger: every trigger must hold.
    TriggerMatchingType: MATCH.all,
    Triggers: chunks(
      // A prefix match, so `image/png; charset=…` still counts.
      INLINE_TYPES.map((type) => (type.endsWith("*") ? type : `${type}*`)),
      PATTERNS_PER_TRIGGER,
    ).map((patterns) => ({
      ...CONTENT_TYPE,
      PatternMatches: patterns,
      PatternMatchingType: MATCH.none,
    })),
  },
  {
    // A browser reads a list of types and takes the last one, so a list
    // that starts with an allowed type isn't one.
    ...DOWNLOAD,
    Description: `${TAG} download a list of types`,
    ExtraActions: [
      {
        ActionParameter1: "Content-Security-Policy",
        ActionParameter2: SANDBOX,
        ActionType: ACTION.setResponseHeader,
      },
    ],
    TriggerMatchingType: MATCH.any,
    Triggers: [
      { ...CONTENT_TYPE, PatternMatches: ["*,*"], PatternMatchingType: MATCH.any },
    ],
  },
];

function bunny(method, path, body) {
  const args = ["api", method, path, "-o", "json"];
  if (body !== undefined) args.push("--body", JSON.stringify(body));
  const out = execFileSync("bunny", args, { encoding: "utf8" });
  // The CLI can append an update notice after the JSON.
  const end = Math.max(out.lastIndexOf("}"), out.lastIndexOf("]"));
  return end === -1 ? null : JSON.parse(out.slice(0, end + 1));
}

function main() {
  const [name, flag] = process.argv.slice(2);
  if (name === undefined) {
    console.error("usage: node infra/media-cdn/rules.mjs <pull zone name> [--apply]");
    process.exit(2);
  }
  const zones = bunny("GET", "/pullzone");
  const zone = zones.find((candidate) => candidate.Name === name);
  if (zone === undefined) throw new Error(`No pull zone named ${name}`);
  const existing = zone.EdgeRules.filter((rule) =>
    rule.Description.startsWith(TAG),
  );
  console.log(
    `${name} (${zone.Id}): replacing ${existing.length} rule(s), adding ${RULES.length}`,
  );
  if (flag !== "--apply") {
    console.log(JSON.stringify(RULES, null, 2));
    return;
  }
  for (const rule of existing) {
    bunny("DELETE", `/pullzone/${zone.Id}/edgerules/${rule.Guid}`);
  }
  for (const rule of RULES) {
    bunny("POST", `/pullzone/${zone.Id}/edgerules/addOrUpdate`, rule);
  }
  console.log("Done. Cached responses keep their old headers until purged:");
  console.log(`  bunny api POST /pullzone/${zone.Id}/purgeCache`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
