import Svg, { Path } from "react-native-svg";

/** How far the tail reaches past the side of the bubble. */
export const TAIL_WIDTH = 4;
/** Bubble corner radius, a touch rounder than a capsule's for one line. */
export const BUBBLE_RADIUS = 20;

/**
 * The iMessage bubble outline with its tail at the bottom right: one
 * continuous path, so the tail flows out from under the corner instead of
 * sitting on top of it. `width` and `height` are the bubble's own box; the
 * tail extends `TAIL_WIDTH` past the right edge.
 */
function tailedBubblePath(width: number, height: number) {
  const r = Math.min(BUBBLE_RADIUS, height / 2);
  const k = r * 0.4;
  const w = width + TAIL_WIDTH;
  const h = height;
  return [
    `M ${w - r} ${h}`,
    `L ${r} ${h}`,
    `C ${k} ${h} 0 ${h - k} 0 ${h - r}`,
    `L 0 ${r}`,
    `C 0 ${k} ${k} 0 ${r} 0`,
    `L ${width - r} 0`,
    `C ${width - k} 0 ${width} ${k} ${width} ${r}`,
    `L ${width} ${h - 11}`,
    // Down into the tail's tip, just past the bottom corner...
    `C ${width} ${h - 1} ${w} ${h} ${w} ${h}`,
    // ...then back under the bubble, curving up and into its bottom edge.
    `C ${w - 4} ${h + 0.5} ${w - 8} ${h - 1} ${w - 11} ${h - 4}`,
    `C ${w - 15} ${h + 0.5} ${w - r} ${h} ${w - r} ${h}`,
    "Z",
  ].join(" ");
}

/**
 * Paints a bubble with its tail behind the bubble's content. Incoming
 * bubbles are mirrored so the tail points left.
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
    <Svg
      pointerEvents="none"
      width={width + TAIL_WIDTH}
      height={height}
      style={{
        left: isOwn ? 0 : -TAIL_WIDTH,
        position: "absolute",
        top: 0,
        transform: isOwn ? undefined : [{ scaleX: -1 }],
      }}
    >
      <Path d={tailedBubblePath(width, height)} fill={color} />
    </Svg>
  );
}
