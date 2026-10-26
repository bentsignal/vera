import type { GitHubConfig } from "./github";
import {
  github,
  GitHubError,
  githubResponse,
  read,
  stringOrNull,
} from "./github";

// The repository's issues as GitHub's REST API lists them, for Vera
// Support's known bugs (supportBugSync.ts). Unlike GitHub's search, the
// list has an issue the moment it's filed.

/** An issue as the REST API lists it, for support's known bugs. */
export interface GitHubIssue {
  readonly body: string;
  readonly closedAt: number | null;
  readonly createdAt: number;
  readonly labels: readonly string[];
  readonly number: number;
  readonly open: boolean;
  readonly stateReason: string | null;
  readonly title: string;
  readonly updatedAt: number;
  readonly url: string;
}

/** Pages of issues read per sync; the next sync carries on from there. */
const MAX_ISSUE_PAGES = 10;

/**
 * Issues (not pull requests) changed at or after `since`, oldest change
 * first, or every issue when `since` is null. Unlike search, the list is
 * current the moment an issue is filed.
 */
export async function issuesChangedSince(
  config: GitHubConfig,
  since: number | null,
) {
  const query = new URLSearchParams({
    direction: "asc",
    per_page: "100",
    sort: "updated",
    state: "all",
    ...(since !== null && { since: new Date(since).toISOString() }),
  });
  let path: string | null =
    `/repos/${config.owner}/${config.name}/issues?${query.toString()}`;
  const issues: GitHubIssue[] = [];
  for (let page = 0; path !== null && page < MAX_ISSUE_PAGES; page++) {
    const response = await githubResponse(config, path);
    const items: unknown[] = Array.isArray(response.body) ? response.body : [];
    for (const item of items) {
      if (read(item, "pull_request") !== undefined) continue;
      issues.push(issueFrom(item));
    }
    path = response.next;
  }
  return issues;
}

/** One issue, or null when there's no such issue (or it's a pull request). */
export async function issueByNumber(config: GitHubConfig, number: number) {
  try {
    const item = await github(
      config,
      `/repos/${config.owner}/${config.name}/issues/${String(number)}`,
    );
    return read(item, "pull_request") === undefined ? issueFrom(item) : null;
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

function issueFrom(item: unknown): GitHubIssue {
  const labels = read(item, "labels");
  const closedAt = stringOrNull(read(item, "closed_at"));
  return {
    body: stringOrNull(read(item, "body")) ?? "",
    closedAt: closedAt === null ? null : Date.parse(closedAt),
    createdAt: Date.parse(String(read(item, "created_at"))),
    labels: (Array.isArray(labels) ? labels : [])
      .map((label: unknown) => read(label, "name"))
      .filter((name) => typeof name === "string"),
    number: Number(read(item, "number")),
    open: read(item, "state") === "open",
    stateReason: stringOrNull(read(item, "state_reason")),
    title: String(read(item, "title")),
    updatedAt: Date.parse(String(read(item, "updated_at"))),
    url: String(read(item, "html_url")),
  };
}
