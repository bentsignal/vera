import Svg, { Path } from "react-native-svg";

/** How far the tail hangs below the bubble. */
export const TAIL_DROP = 6;
/** Bubble corner radius, a touch rounder than a capsule's for one line. */
export const BUBBLE_RADIUS = 20;
/** How round the end of the tail is. */
const TIP_RADIUS = 1.5;

/**
 * A rounded bubble with a tail at its bottom-right corner, like iMessage's:
 * the corner curves in until it bends down into the tail, which ends in a
 * rounded tip and scoops back up into the bottom edge. One continuous path,
 * so there is no seam where the tail meets the bubble. `width` and `height`
 * are the bubble's own box; the tail drops `TAIL_DROP` below it.
 */
function tailedBubblePath(width: number, height: number) {
  const r = Math.min(BUBBLE_RADIUS, height / 2);
  const k = r * 0.45;
  const w = width;
  const h = height;
  const d = TAIL_DROP;
  // Where the tail's scoop meets the bottom edge, short of the left corner.
  const scoopEnd = Math.max(w - 24, r);
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `C ${w - k} 0 ${w} ${k} ${w} ${r}`,
    `L ${w} ${h - r}`,
    // The corner curves in, then bends down into the tail's outer edge...
    `C ${w} ${h - 11} ${w - 4} ${h - 6} ${w - 8} ${h - 3}`,
    `C ${w - 10.5} ${h - 1.1} ${w - 8} ${h + d - TIP_RADIUS - 2.5} ${w - 8} ${h + d - TIP_RADIUS}`,
    // ...which rounds off at the tip instead of meeting in a point...
    `A ${TIP_RADIUS} ${TIP_RADIUS} 0 0 1 ${w - 8 - TIP_RADIUS} ${h + d}`,
    // ...then scoops back up into the bottom edge, toward the center.
    `C ${w - 13} ${h + d} ${w - 17} ${h} ${scoopEnd} ${h}`,
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
