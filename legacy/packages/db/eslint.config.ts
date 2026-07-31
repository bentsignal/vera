import convexPlugin from "@convex-dev/eslint-plugin";
import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";
import { createStrictSyntax } from "@acme/eslint-config/syntax";

export default defineConfig(
  {
    ignores: ["src/_generated/**/"],
  },
  baseConfig,
  strictConfig,
  createStrictSyntax({ ts: true }),
  ...convexPlugin.configs.recommended,
);
