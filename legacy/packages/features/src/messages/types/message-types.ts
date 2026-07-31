import type { UIDataTypes, UIMessagePart, UITools } from "ai";

import type { LibraryFile } from "../../library/types/library-types";
import type { UIMessage } from "../agent";

export { ErrorCode, isUserVisible } from "@acme/db/stream/error-codes";

export { NoticeCode } from "@acme/db/stream/notice-codes";

export type { SystemError, SystemNotice } from "@acme/db/agent/validators";

export type MyTools = UITools;
export interface MyMetadata {
  attachments?: LibraryFile[];
}
export type MyDataParts = UIDataTypes;

export type MyUIMessage = UIMessage<MyMetadata, MyDataParts, MyTools>;
export type MyUIMessagePart = UIMessagePart<MyDataParts, MyTools>;
