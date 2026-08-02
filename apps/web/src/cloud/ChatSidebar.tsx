import type { HomeServer } from "../live/config.ts";
import { ActorAvatar, actorUsername } from "./actor.tsx";

interface ChatSidebarProps {
  home: HomeServer;
  onChooseServer: () => void;
  onSignOut: () => Promise<unknown>;
  user: { actor: string };
}

export function ChatSidebar({
  home,
  onChooseServer,
  onSignOut,
  user,
}: ChatSidebarProps) {
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
      <nav className="room-list" aria-label="Rooms">
        <span>Rooms</span>
        <button aria-current="page" type="button">
          <span>#</span> general
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
            <button onClick={onChooseServer} type="button">
              Change server
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
