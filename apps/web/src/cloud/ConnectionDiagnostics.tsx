import type { HomeServer } from "../live/config.ts";
import type { FederationSource } from "./ConversationHeader.tsx";

interface ConnectionDiagnosticsProps {
  home: HomeServer;
  sources: readonly FederationSource[];
}

export function ConnectionDiagnostics({
  home,
  sources,
}: ConnectionDiagnosticsProps) {
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
