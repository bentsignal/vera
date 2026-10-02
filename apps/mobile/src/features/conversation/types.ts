import type { Attachment, LinkPreview } from "@decentralized-convex/messages";

export type { Attachment, LinkPreview };

export interface Message {
  id: string;
  authorId: string;
  sentAt: Date;
  body?: string;
  attachments: Attachment[];
  linkPreview?: LinkPreview;
  /** Set until the server confirms a message this device sent. */
  status?: "failed" | "sending";
}
