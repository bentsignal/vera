import type {
  FederatedQueryStatus,
  FederationSourceSnapshot,
} from "@decentralized-convex/client";
import type { Message as ChatMessage } from "@decentralized-convex/messages";
import type { FormEvent } from "react";

import type { PdsHome } from "../pds/model.ts";
import { useConversation } from "./useConversation.ts";

interface ConversationProps {
  home: PdsHome;
  homes: readonly PdsHome[];
  onChangeAccount: () => void;
  onSignOut: () => Promise<unknown>;
  user: { actor: string };
}

type ConversationMessages = ReturnType<typeof useConversation>["messages"];

export function Conversation(props: ConversationProps) {
  const conversation = useConversation();
  return (
    <main className="chat-app">
      <Sidebar {...props} />
      <section className="conversation-panel">
        <ConversationHeader
          home={props.home}
          messages={conversation.messages}
        />
        <MessageList home={props.home} messages={conversation.messages} />
        <MessageComposer {...conversation.composer} />
      </section>
    </main>
  );
}

function Sidebar({
  home,
  onChangeAccount,
  onSignOut,
  user,
}: ConversationProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar-title">
        <span className="app-icon" aria-hidden="true">
          V
        </span>
        <div>
          <strong>Vera</strong>
          <small>Federated messaging</small>
        </div>
      </div>
      <nav className="room-list" aria-label="Conversations">
        <span>Conversations</span>
        <button aria-current="page" type="button">
          <span>↔</span> Prototype conversation
        </button>
      </nav>
      <div className="sidebar-account">
        <ActorAvatar actor={user.actor} />
        <div className="account-address">
          <strong>{actorUsername(user.actor)}</strong>
          <small>@{home.domain}</small>
        </div>
        <details className="account-menu">
          <summary aria-label="Account options">•••</summary>
          <div>
            <button onClick={onChangeAccount} type="button">
              Change account
            </button>
            <button onClick={() => void onSignOut()} type="button">
              Sign out
            </button>
          </div>
        </details>
      </div>
    </aside>
  );
}

function ConversationHeader({
  home,
  messages,
}: {
  home: PdsHome;
  messages: ConversationMessages;
}) {
  const { sources, status } = messages.federation;
  const live = sources.filter((source) => source.status === "live").length;
  const complete = live === sources.length;

  return (
    <header className="channel-header">
      <div>
        <h1>Prototype conversation</h1>
        <p>
          {complete
            ? "Messages from every participant's home server"
            : `Incomplete history — ${live} of ${sources.length} homes connected`}
        </p>
      </div>
      <div className="channel-actions">
        <span className="connection-summary" data-status={status}>
          <span />
          {live}/{sources.length} connected
        </span>
        <ConnectionDiagnostics home={home} sources={sources} />
      </div>
    </header>
  );
}

function ConnectionDiagnostics({
  home,
  sources,
}: {
  home: PdsHome;
  sources: readonly FederationSourceSnapshot<ChatMessage[]>[];
}) {
  return (
    <details className="diagnostics">
      <summary>Debug</summary>
      <div className="diagnostics-panel">
        <strong>Connections</strong>
        <div className="diagnostic-sources">
          {sources.map((source) => (
            <div key={source.target.url}>
              <span data-status={source.status} />
              <code>{new URL(source.target.url).hostname}</code>
              <small>{source.status}</small>
            </div>
          ))}
        </div>
        <dl>
          <div>
            <dt>Write target</dt>
            <dd>{home.domain}</dd>
          </div>
          <div>
            <dt>Local auth</dt>
            <dd>Better Auth</dd>
          </div>
          <div>
            <dt>Remote reads</dt>
            <dd>Authenticated per home server</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}

function MessageList({
  home,
  messages,
}: {
  home: PdsHome;
  messages: {
    data?: readonly ChatMessage[];
    federation: {
      sources: readonly FederationSourceSnapshot<ChatMessage[]>[];
      status: FederatedQueryStatus;
    };
    isPending: boolean;
  };
}) {
  const live = messages.federation.sources.filter(
    (source) => source.status === "live",
  ).length;
  const total = messages.federation.sources.length;

  return (
    <div className="message-list" aria-live="polite">
      {live < total ? (
        <aside className="federation-warning" role="status">
          <strong>Showing partial history</strong>
          <p>
            {live} of {total} participant homes are available. An unavailable
            home may be offline or may have rejected authentication.
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

function Message({ message }: { message: ChatMessage }) {
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
            {new Intl.DateTimeFormat("en", {
              hour: "numeric",
              minute: "2-digit",
            }).format(message.sentAt)}
          </time>
        </header>
        <p>{message.body}</p>
      </div>
    </article>
  );
}

function MessageComposer({
  draft,
  error,
  sending,
  setDraft,
  submit,
}: {
  draft: string;
  error?: string;
  sending: boolean;
  setDraft: (draft: string) => void;
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}) {
  return (
    <form className="composer" onSubmit={(event) => void submit(event)}>
      <label>
        <span className="sr-only">Message conversation</span>
        <textarea
          maxLength={4_000}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="Write a message"
          rows={1}
          value={draft}
        />
      </label>
      <button
        aria-label="Send message"
        disabled={draft.trim().length === 0 || sending}
        type="submit"
      >
        Send
      </button>
      {error === undefined ? null : <p className="composer-error">{error}</p>}
    </form>
  );
}

function ActorAvatar({ actor }: { actor: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {actorUsername(actor).slice(0, 2).toUpperCase()}
    </span>
  );
}

function actorUsername(actor: string) {
  return actor.split("@")[0] ?? actor;
}
