import type { ChatMessage } from "../live/queries.ts";
import { ActorAvatar, actorUsername } from "./actor.tsx";

export function Message({ message }: { message: ChatMessage }) {
  const domain = message.authorId.split("@")[1] ?? message.authorId;
  return (
    <article className="message">
      <ActorAvatar actor={message.authorId} />
      <div>
        <header>
          <strong>
            {message.authorName || actorUsername(message.authorId)}
          </strong>
          <span>@{domain}</span>
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
