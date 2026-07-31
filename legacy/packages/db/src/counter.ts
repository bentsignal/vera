import { ShardedCounter } from "@convex-dev/sharded-counter";

import { components } from "./_generated/api";

export const counter = new ShardedCounter(components.shardedCounter);
