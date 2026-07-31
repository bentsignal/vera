import type { Doc } from "../_generated/dataModel";

export interface LibraryFile {
  id: Doc<"files">["_id"];
  key: Doc<"files">["key"];
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
}
