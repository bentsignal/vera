// What Vera Support checks before filing a report (convex/supportKnownBugs.ts):
// the team's known bugs, kept in Convex so a report filed a minute ago is
// already there, and how they're shown to the model to compare by meaning.
// Plain functions, so they can be tested without Convex.

import type { ReportStage } from "./bug-reports.ts";

/** Where a known bug stands, in the words support's model sees. */
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

/** An imported issue's kind, from its labels. */
export function kindOf(labels: readonly string[]): "bug" | "idea" {
  return labels.some((label) => /enhancement|idea|feature/i.test(label))
    ? "idea"
    : "bug";
}

/** How long a closed issue may still be waiting for its fix to ship. */
const RECENTLY_CLOSED = 30 * 24 * 60 * 60 * 1000;

/**
 * Where an issue found on GitHub starts, before the next check reads its
 * fix: open ones, and closed ones that may still be waiting for a release
 * or point to an original, are checked; long-closed ones are settled now.
 */
export function importedStage(
  issue: {
    readonly closedAt: number | null;
    readonly open: boolean;
    readonly stateReason: string | null;
  },
  now: number,
): { active: boolean; stage: ReportStage } {
  if (issue.open) return { active: true, stage: "reported" };
  const reason = issue.stateReason?.toLowerCase() ?? "completed";
  if (reason === "duplicate") return { active: true, stage: "closed" };
  if (reason === "not_planned") return { active: false, stage: "closed" };
  const recent =
    issue.closedAt === null || now - issue.closedAt < RECENTLY_CLOSED;
  return recent
    ? { active: true, stage: "fixed" }
    : { active: false, stage: "live" };
}

/** Words that say nothing about which bug it is. */
const STOP_WORDS = new Set(
  "a about after again all an and any app are as at be been but by can cant could did does doesnt dont for from get gets had has have how i in into is isnt it its just like me my no not of on or out shows so some sometimes still that the their them then there they this to too up vera was wasnt were what when where which while who why will with wont would you your".split(
    " ",
  ),
);

/** A word reduced so its plural and tenses match ("opening" → "open"). */
function stem(word: string) {
  let result = word;
  for (const suffix of ["ing", "ed", "es", "s"]) {
    if (result.length > suffix.length + 2 && result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  return result.endsWith("e") && result.length > 3
    ? result.slice(0, -1)
    : result;
}

export function keywordsOf(text: string) {
  const words = text
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return new Set(words.map(stem));
}

export interface SearchableBug {
  readonly description: string;
  readonly reportedAt: number;
  readonly summary?: string;
  readonly title: string;
}

/**
 * Bugs that share words with `query`, best first: the fallback for bugs
 * the model doesn't see in full (closed and shipped ones). A word in the
 * title or summary counts twice.
 */
export function keywordMatches<Bug extends SearchableBug>(
  bugs: readonly Bug[],
  query: string,
  limit = 5,
) {
  const wanted = keywordsOf(query);
  if (wanted.size === 0) return [];
  return bugs
    .map((bug) => {
      const headline = keywordsOf(`${bug.title} ${bug.summary ?? ""}`);
      const body = keywordsOf(bug.description);
      let score = 0;
      for (const word of wanted) {
        if (headline.has(word)) score += 2;
        else if (body.has(word)) score += 1;
      }
      return { bug, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.bug.reportedAt - a.bug.reportedAt)
    .slice(0, limit)
    .map(({ bug }) => bug);
}
