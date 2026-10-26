import type { GitHubConfig } from "./github";
import { githubResponse, read, stringOrNull } from "./github";

// The repository's issues as GitHub's REST API lists them, for what Vera
// checks before filing (supportLookup.ts). Unlike GitHub's search,
// the list has an issue the moment it's filed.

/** An issue as the REST API lists it. */
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

/** The most pages of issues read at once. */
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
