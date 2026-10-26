// How Vera shows its model the team's issues on GitHub, which it
// checks before filing a report (convex/supportLookup.ts). Plain functions,
// so they can be tested without Convex.

import type { ReportStage } from "./bug-reports.ts";

/** Where a known bug stands, in the words Vera's model sees. */
export type KnownBugStatus =
  | "open"
  | "being fixed"
  | "fixed, not out yet"
  | "fixed and out"
  | "a fix went out, but it's still open"
  | "closed"
  | "duplicate";

export function statusOf(bug: {
  readonly duplicateOf?: number;
  readonly stage: ReportStage;
  /** Its issue is open on GitHub, whatever its fixes say. */
  readonly stillOpen?: boolean;
}): KnownBugStatus {
  switch (bug.stage) {
    case "reported":
      return "open";
    case "pickedUp":
    case "inProgress":
      return "being fixed";
    case "fixed":
      return "fixed, not out yet";
    case "live":
      return bug.stillOpen === true
        ? "a fix went out, but it's still open"
        : "fixed and out";
    case "closed":
      return bug.duplicateOf === undefined ? "closed" : "duplicate";
  }
}

/** How much of a bug's description the model sees in the list. */
const BRIEF_LENGTH = 240;

/**
 * The start of an issue's description, as one short line: the "What
 * happened" section of an issue support filed, otherwise the body, without
 * Markdown.
 */
export function briefOf(body: string, length = BRIEF_LENGTH) {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => line.trim() === "## What happened");
  const end = lines.findIndex(
    (line, index) =>
      index > start && (line.startsWith("## ") || line.trim() === "---"),
  );
  const section =
    start === -1
      ? body
      : lines.slice(start + 1, end === -1 ? undefined : end).join("\n");
  const text = section
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= length) return text;
  const cut = text.slice(0, length);
  const space = cut.lastIndexOf(" ");
  return `${(space > length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
