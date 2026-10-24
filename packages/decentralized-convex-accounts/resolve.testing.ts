import { registerHooks } from "node:module";

// Tests only: lets `node --test` load modules that import Convex's
// generated code (`./_generated/api.js`, which is TypeScript here), such as
// mutations that schedule work. The second dot in its name keeps Convex
// from bundling it as a module.

registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(
      /\/_generated\/[^/]+\.js$/.test(specifier)
        ? specifier.replace(/\.js$/, ".ts")
        : specifier,
      context,
    );
  },
});
