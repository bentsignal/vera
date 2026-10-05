import Svg, { Path } from "react-native-svg";

/** How far the tail hangs below the bubble. */
export const TAIL_DROP = 6;
/** Bubble corner radius, a touch rounder than a capsule's for one line. */
export const BUBBLE_RADIUS = 20;

/**
 * A rounded bubble with a tail hanging from its bottom edge, just inside the
 * bottom-right corner: the corner keeps its full curve, and the tail grows
 * out of the bottom like a small hook pointing toward the corner. One
 * continuous path, so there is no seam where the tail meets the bubble.
 * `width` and `height` are the bubble's own box; the tail drops `TAIL_DROP`
 * below it.
 */
function tailedBubblePath(width: number, height: number) {
  const r = Math.min(BUBBLE_RADIUS, height / 2);
  const k = r * 0.45;
  const w = width;
  const h = height;
  const d = TAIL_DROP;
  // Where the bottom-right corner's curve meets the bottom edge.
  const corner = w - r;
  return [
    `M ${r} 0`,
    `L ${w - r} 0`,
    `C ${w - k} 0 ${w} ${k} ${w} ${r}`,
    `L ${w} ${h - r}`,
    `C ${w} ${h - k} ${w - k} ${h} ${corner} ${h}`,
    // Down into the tip, which sits under the end of the corner's curve...
    `C ${corner - 1} ${h + d * 0.4} ${corner + 1} ${h + d * 0.85} ${corner + 4} ${h + d}`,
    // ...then a soft scoop back up into the bottom edge, toward the center.
    `C ${corner - 4} ${h + d} ${corner - 10} ${h + d * 0.5} ${corner - 14} ${h}`,
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
