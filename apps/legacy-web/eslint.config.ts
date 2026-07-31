import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";
import { reactConfig } from "@acme/eslint-config/react";
import { createStrictSyntax } from "@acme/eslint-config/syntax";

export default defineConfig(
  {
    ignores: [
      ".tanstack/**",
      ".output/**",
      ".vinxi/**",
      "dist/**",
      "src/routeTree.gen.ts",
    ],
  },
  baseConfig,
  reactConfig,
  strictConfig,
  createStrictSyntax({ ts: true, react: true, env: true }),
);
