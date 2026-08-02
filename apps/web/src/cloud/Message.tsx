import type { ChatMessage } from "../live/queries.ts";
import { ActorAvatar, actorUsername } from "./actor.tsx";

export function Message({ message }: { message: ChatMessage }) {
  return (
    <article className="message">
      <ActorAvatar actor={message.author} />
      <div>
        <header>
          <strong>{actorUsername(message.author)}</strong>
          <span>@{message.origin}</span>
          <time dateTime={new Date(message.sentAt).toISOString()}>
            {formatTime(message.sentAt)}
          </time>
        </header>
        <p>{message.body}</p>
      </div>
    </article>
  );
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(timestamp);
}
