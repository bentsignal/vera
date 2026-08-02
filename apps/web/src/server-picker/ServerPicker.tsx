import type { HomeServer } from "../live/config.ts";

interface ServerPickerProps {
  homes: readonly HomeServer[];
  onChoose: (home: HomeServer) => void;
}

export function ServerPicker({ homes, onChoose }: ServerPickerProps) {
  return (
    <main className="account-shell">
      <section className="account-panel server-picker">
        <header className="account-header">
          <span className="app-icon" aria-hidden="true">
            V
          </span>
          <div>
            <h1>Vera</h1>
            <p>Choose the server where your account will live.</p>
          </div>
        </header>
        <div className="server-list">
          {homes.map((server, index) => (
            <button
              className="server-row"
              key={server.id}
              onClick={() => onChoose(server)}
              type="button"
            >
              <span className="server-index">{index + 1}</span>
              <span className="server-address">
                <strong>{server.domain}</strong>
                <small>Convex deployment</small>
              </span>
              <span className="row-arrow" aria-hidden="true">
                →
              </span>
            </button>
          ))}
        </div>
        <p className="account-hint">
          To test federation, open another tab and choose the other server.
        </p>
      </section>
    </main>
  );
}
