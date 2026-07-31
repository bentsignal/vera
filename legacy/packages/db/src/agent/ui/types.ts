import type { UIMessage as AIUIMessage, UIDataTypes, UITools } from "ai";

import type {
  MessageDoc,
  MessageStatus,
  SystemError,
  SystemNotice,
} from "../validators";

export type UIStatus = "streaming" | MessageStatus;

export type UIMessage<
  METADATA = unknown,
  DATA_PARTS extends UIDataTypes = UIDataTypes,
  TOOLS extends UITools = UITools,
> = AIUIMessage<METADATA, DATA_PARTS, TOOLS> & {
  key: string;
  order: number;
  stepOrder: number;
  status: UIStatus;
  agentName?: string;
  userId?: string;
  text: string;
  _creationTime: number;
  notices?: SystemNotice[];
  errors?: SystemError[];
};

export interface ExtraFields<METADATA = unknown> {
  streaming?: boolean;
  metadata?: METADATA;
}

export type MessageDocWithExtras<METADATA = unknown> = MessageDoc &
  ExtraFields<METADATA>;
