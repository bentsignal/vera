import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";
import { reactConfig } from "@acme/eslint-config/react";
import { createStrictSyntax } from "@acme/eslint-config/syntax";

export default defineConfig(
  // Expo config plugins are build-time CommonJS scripts.
  { ignores: ["plugins/**"] },
  baseConfig,
  strictConfig,
  reactConfig,
  createStrictSyntax({ ts: true, react: true }),
);
