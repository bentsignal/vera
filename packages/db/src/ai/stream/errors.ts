import { ErrorCode } from "./error_codes";

export class EarlyAborted extends Error {
  readonly _tag = "EarlyAborted";
}

export class UserAborted extends Error {
  readonly _tag = "UserAborted";
}

export class StreamInitError extends Error {
  readonly _tag = "StreamInitError";

  constructor(
    readonly args: {
      readonly cause: unknown;
      readonly model: string;
    },
  ) {
    super("Stream init failed");
  }

  get cause() {
    return this.args.cause;
  }

  get model() {
    return this.args.model;
  }
}

export class StreamConsumeError extends Error {
  readonly _tag = "StreamConsumeError";

  constructor(
    readonly args: {
      readonly cause: unknown;
    },
  ) {
    super("Stream consume failed");
  }

  get cause() {
    return this.args.cause;
  }
}

export class FollowUpGenerationError extends Error {
  readonly _tag = "FollowUpGenerationError";

  constructor(
    readonly args: {
      readonly cause: unknown;
    },
  ) {
    super("Follow-up generation failed");
  }

  get cause() {
    return this.args.cause;
  }
}

// Raised whenever a Convex query/mutation invoked from within the Effect
// program rejects. `op` identifies the call site for logging (e.g.
// "wasAborted", "events.emit") so we can triage without relying on the
// underlying error message.
export class ConvexCallError extends Error {
  readonly _tag = "ConvexCallError";

  constructor(
    readonly args: {
      readonly cause: unknown;
      readonly op: string;
    },
  ) {
    super("Convex call failed");
  }

  get cause() {
    return this.args.cause;
  }

  get op() {
    return this.args.op;
  }
}

export class GenerateResponseError extends Error {
  readonly _tag = "GenerateResponseError";

  constructor(
    readonly args: {
      readonly cause: unknown;
      readonly phase: "createThread" | "generateText";
    },
  ) {
    super("Generate response failed");
  }

  get cause() {
    return this.args.cause;
  }

  get phase() {
    return this.args.phase;
  }
}

export type StreamResponseError =
  | StreamInitError
  | StreamConsumeError
  | FollowUpGenerationError
  | ConvexCallError;

export function errorCodeFor(
  e:
    | StreamInitError
    | StreamConsumeError
    | FollowUpGenerationError
    | ConvexCallError,
) {
  switch (e._tag) {
    case "StreamInitError":
      return ErrorCode.StreamInitFailed;
    case "StreamConsumeError":
      return ErrorCode.StreamConsumeFailed;
    case "FollowUpGenerationError":
      return ErrorCode.FollowUpsFailed;
    case "ConvexCallError":
      return ErrorCode.ConvexCallFailed;
  }
}
