import type { Attachment, LinkPreview } from "@decentralized-convex/messages";

import type { ReactionSummary } from "~/features/messaging/reactions";

export type { Attachment, LinkPreview };

export interface Message {
  id: string;
  authorId: string;
  sentAt: Date;
  body?: string;
  attachments: Attachment[];
  linkPreview?: LinkPreview;
  reactions: readonly ReactionSummary[];
  /** Set until the server confirms a message this device sent. */
  status?: "failed" | "sending";
}
