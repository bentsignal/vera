/**
 * How far above the field the field's glass stays, after a send made the
 * field `lost` shorter while the list's room for the composer was
 * `wasRoom`: by as much as the room hasn't closed yet (`room` now), so the
 * glass's edge stays on the messages'. 0 lets it go. Only the React Native
 * list closes its room with the messages (`useComposerRoom`); the native
 * list takes the composer's new height at once (`roomCloses` false), and
 * waiting on its room held the glass at the old height until
 * `FOLLOW_FRAMES` ran out, about a second after the field shrank.
 */
export function glassAbove({
  lost,
  wasRoom,
  room,
  roomCloses,
}: {
  lost: number;
  wasRoom: number;
  room: number;
  roomCloses: boolean;
}) {
  "worklet";
  if (!roomCloses) return 0;
  return Math.max(0, lost - (wasRoom - room));
}
