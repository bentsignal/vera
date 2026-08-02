import type { HomeServer } from "../live/config.ts";
import type { ChatMessage } from "../live/queries.ts";
import { Message } from "./Message.tsx";

interface MessageListProps {
  home: HomeServer;
  messages: { data?: readonly ChatMessage[]; isPending: boolean };
}

export function MessageList({ home, messages }: MessageListProps) {
  return (
    <div className="message-list" aria-live="polite">
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
        <Message key={message.eventId} message={message} />
      ))}
    </div>
  );
}
