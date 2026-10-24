import type { IssueState } from "../bug-reports";
import { closingCommentOf, duplicateOf } from "../issue-closures";
import { optionalEnvironment } from "./lib";

// GitHub for Vera Support's bug reports: creating issues and reading how
// their fixes are going. Needs GITHUB_TOKEN (a fine-grained token with
// read and write access to issues, read access to pull requests and
// contents) and GITHUB_REPOSITORY ("owner/name"). Without them, reports are
// kept on the PDS only (supportReports.ts).

export interface GitHubConfig {
  readonly name: string;
  readonly owner: string;
  readonly token: string;
}

export function githubConfig(): GitHubConfig | null {
  const token = optionalEnvironment("GITHUB_TOKEN");
  const repository = optionalEnvironment("GITHUB_REPOSITORY");
  if (token === null || repository === null) return null;
  const [owner, name] = repository.split("/");
  if (!owner || !name) return null;
  return { name, owner, token };
}

export async function github(
  config: GitHubConfig,
  path: string,
  init: { body?: unknown; method?: string } = {},
): Promise<unknown> {
  return (await githubResponse(config, path, init)).body;
}

/** A request's JSON, and the next page's path when there is one. */
export async function githubResponse(
  config: GitHubConfig,
  path: string,
  init: { body?: unknown; method?: string } = {},
) {
  const response = await fetch(`https://api.github.com${path}`, {
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
      "User-Agent": "vera-support",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    method: init.method ?? "GET",
  });
  if (!response.ok) {
    throw new GitHubError(
      response.status,
      `GitHub ${init.method ?? "GET"} ${path}: ${String(response.status)} ${await response.text()}`,
    );
  }
  const next = /<https:\/\/api\.github\.com([^>]+)>;\s*rel="next"/.exec(
    response.headers.get("Link") ?? "",
  )?.[1];
  const body: unknown = await response.json();
  return { body, next: next ?? null };
}

export class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function createIssue(
  config: GitHubConfig,
  issue: { body: string; labels: readonly string[]; title: string },
) {
  const path = `/repos/${config.owner}/${config.name}/issues`;
  let created: unknown;
  try {
    created = await github(config, path, { body: issue, method: "POST" });
  } catch (error) {
    // A label GitHub won't take shouldn't lose the report.
    if (!(error instanceof GitHubError) || error.status !== 422) throw error;
    created = await github(config, path, {
      body: { body: issue.body, title: issue.title },
      method: "POST",
    });
  }
  const number = read(created, "number");
  const url = read(created, "html_url");
  if (typeof number !== "number" || typeof url !== "string") {
    throw new Error("GitHub returned an issue without a number");
  }
  return { number, url };
}

export async function commentOnIssue(
  config: GitHubConfig,
  number: number,
  body: string,
) {
  await github(
    config,
    `/repos/${config.owner}/${config.name}/issues/${String(number)}/comments`,
    { body: { body }, method: "POST" },
  );
}

const DUPLICATE_FIELDS = `canonical { ... on Issue { number } }
  duplicate { ... on Issue { number } }`;

const PULL_REQUEST_FIELDS = `number url state merged baseRefName
  mergeCommit { oid }
  labels(first: 20) { nodes { name } }
  files(first: 100) { nodes { path } }`;

/** Issues read per GraphQL request, so a long list stays within GitHub's limits. */
const ISSUES_PER_REQUEST = 20;

/** Each issue's state, by number. Missing issues are left out. */
export async function issueStates(
  config: GitHubConfig,
  numbers: readonly number[],
) {
  const states = new Map<number, IssueState>();
  const unique = [...new Set(numbers)];
  for (let start = 0; start < unique.length; start += ISSUES_PER_REQUEST) {
    const chunk = unique.slice(start, start + ISSUES_PER_REQUEST);
    for (const [number, state] of await issueStatesOnce(config, chunk)) {
      states.set(number, state);
    }
  }
  return states;
}

async function issueStatesOnce(
  config: GitHubConfig,
  numbers: readonly number[],
) {
  const states = new Map<number, IssueState>();
  if (numbers.length === 0) return states;
  const issues = numbers
    .map(
      (number) => `i${String(number)}: issue(number: ${String(number)}) {
        number state stateReason closedAt
        assignees(first: 1) { totalCount }
        comments(last: 10) { nodes { authorAssociation body createdAt } }
        duplicates: timelineItems(last: 20, itemTypes: [MARKED_AS_DUPLICATE_EVENT, UNMARKED_AS_DUPLICATE_EVENT]) {
          nodes {
            __typename
            ... on MarkedAsDuplicateEvent { ${DUPLICATE_FIELDS} }
            ... on UnmarkedAsDuplicateEvent { ${DUPLICATE_FIELDS} }
          }
        }
        closedByPullRequestsReferences(first: 10, includeClosedPrs: true) {
          nodes { ${PULL_REQUEST_FIELDS} }
        }
        timelineItems(last: 20, itemTypes: [CLOSED_EVENT]) {
          nodes { ... on ClosedEvent { closer { __typename ... on Commit { oid } } } }
        }
      }`,
    )
    .join("\n");
  const result = await github(config, "/graphql", {
    body: {
      query: `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name) {
          defaultBranchRef { name }
          ${issues}
        }
      }`,
      variables: { name: config.name, owner: config.owner },
    },
    method: "POST",
  });
  const repository = read(read(result, "data"), "repository");
  const defaultBranch = read(read(repository, "defaultBranchRef"), "name");
  for (const number of numbers) {
    const issue = read(repository, `i${String(number)}`);
    if (issue === null || issue === undefined) continue;
    const pullRequests = nodes(read(issue, "closedByPullRequestsReferences"))
      // Only merges into the default branch reach a release.
      .filter((pr) => read(pr, "baseRefName") === defaultBranch)
      .map((pr) => ({
        mergeCommit: stringOrNull(read(read(pr, "mergeCommit"), "oid")),
        merged: read(pr, "merged") === true,
        native: nodes(read(pr, "labels")).some((label) =>
          isNativeLabel(read(label, "name")),
        ),
        open: read(pr, "state") === "OPEN",
        paths: nodes(read(pr, "files"))
          .map((file) => read(file, "path"))
          .filter((path) => typeof path === "string"),
        ref: {
          number: Number(read(pr, "number")),
          url: String(read(pr, "url")),
        },
      }));
    const closingCommit =
      nodes(read(issue, "timelineItems"))
        .map((event) => read(event, "closer"))
        .filter((closer) => read(closer, "__typename") === "Commit")
        .map((closer) => stringOrNull(read(closer, "oid")))
        .findLast((oid) => oid !== null) ?? null;
    states.set(number, {
      assigned: Number(read(read(issue, "assignees"), "totalCount")) > 0,
      closingComment: closingCommentOf(
        nodes(read(issue, "comments")).map((comment) => ({
          association: String(read(comment, "authorAssociation")),
          body: String(read(comment, "body")),
          createdAt: String(read(comment, "createdAt")),
        })),
        stringOrNull(read(issue, "closedAt")),
      ),
      closingCommit,
      duplicateOf: duplicateOf(
        nodes(read(issue, "duplicates")).map((event) => ({
          canonical: numberOrNull(read(read(event, "canonical"), "number")),
          duplicate: numberOrNull(read(read(event, "duplicate"), "number")),
          marked: read(event, "__typename") === "MarkedAsDuplicateEvent",
        })),
        number,
      ),
      pullRequests,
      state: read(issue, "state") === "CLOSED" ? "CLOSED" : "OPEN",
      stateReason: stringOrNull(read(issue, "stateReason")),
    });
  }
  return states;
}

/**
 * Open and closed issues, and merged pull requests, that match `query`,
 * best first: what support checks before filing a report.
 */
export async function searchRepository(config: GitHubConfig, query: string) {
  const repo = `repo:${config.owner}/${config.name}`;
  async function search(filter: string): Promise<unknown[]> {
    const result = await github(
      config,
      `/search/issues?per_page=5&q=${encodeURIComponent(`${query} ${repo} ${filter}`)}`,
    );
    const items = read(result, "items");
    return Array.isArray(items) ? items.map((item: unknown) => item) : [];
  }
  const [issues, pullRequests] = await Promise.all([
    search("is:issue"),
    search("is:pr is:merged"),
  ]);
  return {
    issues: issues.map((issue) => ({
      about: excerpt(read(issue, "body")),
      createdAt: String(read(issue, "created_at")),
      number: Number(read(issue, "number")),
      state: String(read(issue, "state")),
      stateReason: stringOrNull(read(issue, "state_reason")),
      title: String(read(issue, "title")),
      url: String(read(issue, "html_url")),
    })),
    pullRequests: pullRequests.map((pr) => ({
      about: excerpt(read(pr, "body")),
      mergedAt: stringOrNull(read(read(pr, "pull_request"), "merged_at")),
      number: Number(read(pr, "number")),
      title: String(read(pr, "title")),
      url: String(read(pr, "html_url")),
    })),
  };
}

/** A merged pull request's merge commit and the files it changed. */
export async function pullRequestFix(config: GitHubConfig, number: number) {
  const path = `/repos/${config.owner}/${config.name}/pulls/${String(number)}`;
  const [pr, files] = await Promise.all([
    github(config, path),
    github(config, `${path}/files?per_page=100`),
  ]);
  const labels = read(pr, "labels");
  return {
    mergeCommit: stringOrNull(read(pr, "merge_commit_sha")),
    native: (Array.isArray(labels) ? labels : []).some((label: unknown) =>
      isNativeLabel(read(label, "name")),
    ),
    paths: (Array.isArray(files) ? files : [])
      .map((file) => read(file, "filename"))
      .filter((name) => typeof name === "string"),
  };
}

export function read(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null
    ? Reflect.get(value, name)
    : undefined;
}

function nodes(connection: unknown): unknown[] {
  const list = read(connection, "nodes");
  return Array.isArray(list) ? list : [];
}

/** CI's label for a PR that changes native code (only a store build ships it). */
function isNativeLabel(name: unknown) {
  return typeof name === "string" && name.includes("Native Change");
}

/** The start of an issue or pull request's description. */
function excerpt(body: unknown) {
  return typeof body === "string" ? body.slice(0, 400) : "";
}

export function stringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value: unknown) {
  return typeof value === "number" ? value : null;
}
