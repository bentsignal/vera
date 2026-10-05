import Svg, { Path } from "react-native-svg";

/** How far the tail hangs below the bubble. */
export const TAIL_DROP = 7;
/** Bubble corner radius, a touch rounder than a capsule's for one line. */
export const BUBBLE_RADIUS = 20;

/**
 * A rounded bubble with iMessage's tail at its bottom-right corner: the
 * corner curves in to a waist, and the tail below it curls back out like a
 * horn to a round tip, then sweeps up into the bottom edge. The tail's
 * points were fitted to a trace of iMessage's, in points measured from the
 * bubble's right and bottom edges, and don't scale with the bubble. One
 * continuous path, so there is no seam where the tail meets the bubble.
 * `width` and `height` are the bubble's own box; the tail drops `TAIL_DROP`
 * below it.
 */
function tailedBubblePath(width: number, height: number) {
  const r = Math.min(BUBBLE_RADIUS, height / 2);
  const k = r * 0.45;
  const w = width;
  const h = height;
  // The corner leaves the side 20 above the bottom, or lower on a short
  // bubble, below where the top corner ends.
  const cornerStart = Math.max(h - 20, r);
  // Where the tail meets the bottom edge, short of the left corner.
  const tailEnd = Math.max(w - 21.89, r);
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `C ${w - k} 0 ${w} ${k} ${w} ${r}`,
    `L ${w} ${cornerStart}`,
    // The corner curves in to the tail's waist...
    `C ${w} ${h - 7.65} ${w - 10.52} ${h - 4.3} ${w - 10.52} ${h - 0.07}`,
    // ...then the tail curls back out toward the edge...
    `C ${w - 10.52} ${h + 2.54} ${w - 9.51} ${h + 3.61} ${w - 8.42} ${h + 5.21}`,
    // ...rounds off at the tip...
    `A 1.03 1.03 0 0 1 ${w - 9.67} ${h + 6.73}`,
    // ...and sweeps back up into the bottom edge.
    `C ${w - 17.42} ${h + 3.49} ${Math.max(w - 19.39, tailEnd)} ${h} ${tailEnd} ${h}`,
    `L ${r} ${h}`,
    `C ${k} ${h} 0 ${h - k} 0 ${h - r}`,
    `L 0 ${r}`,
    `C 0 ${k} ${k} 0 ${r} 0`,
    "Z",
  ].join(" ");
}

/**
 * Paints a bubble with its tail behind the bubble's content. Incoming
 * bubbles are mirrored so the tail sits at the bottom left.
 */
export function TailedBubble({
  width,
  height,
  color,
  isOwn,
}: {
  width: number;
  height: number;
  color: string;
  isOwn: boolean;
}) {
  return (
    // Sized by insets, not `width`/`height`: Svg rounds those down to whole
    // points, which clipped the edge of bubbles with fractional widths.
    <Svg
      pointerEvents="none"
      style={{
        bottom: -TAIL_DROP,
        left: 0,
        position: "absolute",
        right: 0,
        top: 0,
        transform: isOwn ? undefined : [{ scaleX: -1 }],
      }}
    >
      <Path d={tailedBubblePath(width, height)} fill={color} />
    </Svg>
  );
}
