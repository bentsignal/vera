import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";
import { reactConfig } from "@acme/eslint-config/react";

export default defineConfig(
  { ignores: ["src/routeTree.gen.ts"] },
  baseConfig,
  strictConfig,
  reactConfig,
);
