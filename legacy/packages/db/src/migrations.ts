import { Migrations } from "@convex-dev/migrations";

import type { DataModel } from "./_generated/dataModel.js";
import { components } from "./_generated/api.js";

export const migrations = new Migrations<DataModel>(components.migrations);
export const run = migrations.runner();
