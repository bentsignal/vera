import type {
  GenericActionCtx,
  GenericDataModel,
  GenericMutationCtx,
  GenericQueryCtx,
} from "convex/server";

import type { StreamDelta, StreamMessage } from "../../../src/agent/validators";

export type QueryCtx = Pick<GenericQueryCtx<GenericDataModel>, "runQuery">;
export type MutationCtx = Pick<
  GenericMutationCtx<GenericDataModel>,
  "runQuery" | "runMutation"
>;
export type ActionCtx = Pick<
  GenericActionCtx<GenericDataModel>,
  "runQuery" | "runMutation" | "runAction" | "storage" | "auth"
>;

export type SyncStreamsReturnValue =
  | { kind: "list"; messages: StreamMessage[] }
  | { kind: "deltas"; deltas: StreamDelta[] }
  | undefined;
