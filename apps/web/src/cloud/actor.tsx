export function ActorAvatar({ actor }: { actor: string }) {
  return (
    <span className="avatar" aria-hidden="true">
      {actorUsername(actor).slice(0, 2).toUpperCase()}
    </span>
  );
}

export function actorUsername(actor: string) {
  return actor.split("@")[0] ?? actor;
}
