import type { EventType } from "@acme/db/agent/validators";
import type { Doc } from "@acme/db/model";

// `id` is `string` rather than `Id<"threads">` because the sidebar can hold
// an optimistic row keyed by clientId before the server has assigned `_id`.
export interface Thread {
  title: Doc<"threads">["title"];
  id: string;
  active: boolean;
  latestEvent: EventType | null;
  pinned: boolean;
}

export interface PureThread {
  id: string;
  clientId?: string;
  title: Doc<"threads">["title"];
  updatedAt: Doc<"threads">["updatedAt"];
  latestEvent: EventType | null;
  pinned: Doc<"threads">["pinned"];
}
