import type { BetterOmit, Expand } from "convex-helpers";
import type { FunctionArgs, FunctionReference } from "convex/server";

import type {
  StreamArgs,
  StreamDelta,
  StreamMessage,
} from "@acme/db/agent/validators";

export type SyncStreamsReturnValue =
  | { kind: "list"; messages: StreamMessage[] }
  | { kind: "deltas"; deltas: StreamDelta[] }
  | undefined;

export type StreamQuery<Args = Record<string, unknown>> = FunctionReference<
  "query",
  "public",
  {
    threadId: string;
    streamArgs?: StreamArgs; // required for stream query
  } & Args,
  { streams: SyncStreamsReturnValue }
>;

export type StreamQueryArgs<Query extends StreamQuery<unknown>> =
  Query extends StreamQuery<unknown>
    ? Expand<BetterOmit<FunctionArgs<Query>, "streamArgs">>
    : never;
