import type { HomeServer } from "../live/config.ts";

export function ServerLoading({ home }: { home: HomeServer }) {
  return (
    <main className="account-shell">
      <section className="account-panel loading-panel">
        <span className="loading-dot" />
        <p>Connecting to {home.domain}</p>
      </section>
    </main>
  );
}
