import type { HomeServer } from "../live/config.ts";
import { ConnectionDiagnostics } from "./ConnectionDiagnostics.tsx";

export interface FederationSource {
  status: string;
  target: { ids: readonly string[]; url: string };
}

interface ConversationHeaderProps {
  home: HomeServer;
  messages: {
    federation: { sources: readonly FederationSource[]; status: string };
  };
}

export function ConversationHeader({
  home,
  messages,
}: ConversationHeaderProps) {
  const { sources, status } = messages.federation;
  const live = sources.filter((source) => source.status === "live").length;
  const complete = live === sources.length;

  return (
    <header className="channel-header">
      <div>
        <h1>Test conversation</h1>
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
