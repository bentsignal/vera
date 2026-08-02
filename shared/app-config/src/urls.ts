const APP_HOSTS = {
  web: "www.vera",
  xr: "xr.vera",
  docs: "docs.vera",
} as const;

type AppId = keyof typeof APP_HOSTS;

interface AppUrlOptions {
  nodeEnv?: "development" | "production";
  worktreeId?: string;
}

function normalizeWorktreeId(worktreeId: string | undefined) {
  const slug = worktreeId
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!slug) {
    return undefined;
  }

  const t3WorktreeId = /(?:^|-)([a-f0-9]{8})$/.exec(slug);
  return t3WorktreeId?.[1] ?? slug;
}

function getDomainSuffix(options: AppUrlOptions) {
  return options.nodeEnv === "production" ? "chat" : "localhost";
}

function appUrl(app: AppId, options: AppUrlOptions = {}) {
  const prefix = normalizeWorktreeId(options.worktreeId);
  const host = [prefix, APP_HOSTS[app], getDomainSuffix(options)]
    .filter(Boolean)
    .join(".");

  return new URL(`https://${host}`).origin;
}

export function createAppUrls(options: AppUrlOptions = {}) {
  return {
    web: appUrl("web", options),
    xr: appUrl("xr", options),
    docs: appUrl("docs", options),
  } as const;
}
