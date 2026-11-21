// Checks the environment a JavaScript bundle is built with, before Metro
// bundles anything (metro.config.cjs): exports, OTA updates, and the bundle
// step of every native build. A store bundle (any variant but Vera Dev,
// app.config.ts) must name its PDS, since src/env.ts falls back to the dev
// server, and must never carry the dev tools secret (src/env.ts).

/** @param {Record<string, string | undefined>} env */
function buildEnvironmentProblems(env) {
  if (env.APP_VARIANT === "development") return [];
  const problems = [];
  if (!env.EXPO_PUBLIC_VERA_DOMAIN) {
    problems.push(
      "EXPO_PUBLIC_VERA_DOMAIN is unset: a store bundle would talk to the dev server. Set it (eas.json does for each profile).",
    );
  }
  if (env.EXPO_PUBLIC_DEV_TOOLS_SECRET) {
    problems.push(
      "EXPO_PUBLIC_DEV_TOOLS_SECRET is set: only Vera Dev bundles (APP_VARIANT=development) may carry it.",
    );
  }
  return problems;
}

/** @param {Record<string, string | undefined>} env */
function checkBuildEnvironment(env) {
  const problems = buildEnvironmentProblems(env);
  if (problems.length > 0) {
    throw new Error(`Refusing to bundle Vera:\n- ${problems.join("\n- ")}`);
  }
}

module.exports = { buildEnvironmentProblems, checkBuildEnvironment };
