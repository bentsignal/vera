import { defineConfig } from "eslint/config";

import { baseConfig, strictConfig } from "@acme/eslint-config/base";

export default defineConfig(baseConfig, strictConfig);
