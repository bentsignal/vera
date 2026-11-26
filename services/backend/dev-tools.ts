// Who may use a dev PDS's dev tools: the passwordless dev sign-in and the
// bot actions in convex/dev*.ts. A dev PDS is on the internet like any
// other, so being a dev deployment (`DEV_TOOLS=true`) isn't enough: every
// request also carries `DEV_TOOLS_SECRET`, which only Shawn's scripts and
// the bundles his Metro serves to Vera Dev have (scripts/dev-tools-secret.sh).
// Production sets neither variable.

/** The header the dev sign-in carries the secret in. */
export const DEV_TOOLS_SECRET_HEADER = "x-vera-dev-tools-secret";

/** Shorter secrets are treated as unset (the tools stay off). */
export const MIN_DEV_TOOLS_SECRET_LENGTH = 32;

interface DevToolsEnvironment {
  readonly DEV_TOOLS?: string;
  readonly DEV_TOOLS_SECRET?: string;
}

/** Whether this deployment has dev tools at all. */
export function devToolsOn(environment: DevToolsEnvironment) {
  return (
    environment.DEV_TOOLS === "true" &&
    (environment.DEV_TOOLS_SECRET ?? "").length >= MIN_DEV_TOOLS_SECRET_LENGTH
  );
}

/** Whether a request carrying `given` may use them. */
export function devToolsSecretAccepted(
  environment: DevToolsEnvironment,
  given: unknown,
) {
  if (!devToolsOn(environment) || typeof given !== "string") return false;
  return sameText(given, environment.DEV_TOOLS_SECRET ?? "");
}

/** Compares without stopping at the first difference. */
function sameText(left: string, right: string) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < right.length; index++) {
    difference |= (left.charCodeAt(index) || 0) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
