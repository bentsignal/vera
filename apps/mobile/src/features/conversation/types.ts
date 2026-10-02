export type Attachment =
  | {
      kind: "image";
      id: string;
      width: number;
      height: number;
    }
  | {
      kind: "video";
      id: string;
      width: number;
      height: number;
      durationSeconds: number;
    }
  | {
      kind: "file";
      id: string;
      name: string;
      sizeBytes: number;
    };

export interface LinkPreview {
  url: string;
  siteName: string;
  title: string;
  description: string;
}

export interface Message {
  id: string;
  authorId: string;
  sentAt: Date;
  body?: string;
  attachments: Attachment[];
  linkPreview?: LinkPreview;
}
