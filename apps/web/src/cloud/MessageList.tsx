import type { HomeServer } from "../live/config.ts";
import type { ChatMessage } from "../live/queries.ts";
import { Message } from "./Message.tsx";

interface MessageListProps {
  home: HomeServer;
  messages: {
    data?: readonly ChatMessage[];
    federation: {
      sources: readonly { status: string }[];
      status: string;
    };
    isPending: boolean;
  };
}

export function MessageList({ home, messages }: MessageListProps) {
  const live = messages.federation.sources.filter(
    (source) => source.status === "live",
  ).length;
  const total = messages.federation.sources.length;
  const incomplete = live < total;

  return (
    <div className="message-list" aria-live="polite">
      {incomplete ? (
        <aside className="federation-warning" role="status">
          <strong>Showing partial history</strong>
          <p>
            This browser is authenticated with {live} of {total} PDS homes.
            Portable cross-PDS authentication is not connected yet.
          </p>
        </aside>
      ) : null}
      {messages.isPending ? (
        <p className="empty-state">Connecting to participant servers…</p>
      ) : null}
      {messages.data?.length === 0 ? (
        <div className="empty-state">
          <span>#</span>
          <strong>No messages yet</strong>
          <p>Start the conversation from {home.domain}.</p>
        </div>
      ) : null}
      {messages.data?.map((message) => (
        <Message key={message.messageId} message={message} />
      ))}
    </div>
  );
}
