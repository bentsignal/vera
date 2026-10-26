// Reads an `agent-device snapshot -i --raw` dump offline and reports
// where the newest message row ends against the top of the composer bar,
// for the bottom-row acceptance in .plans/native-message-list.md (item 9).
// It's evidence from one still snapshot, not proof: a gap here says
// nothing about frames in a transition, and AX `hittable` isn't a tap.
//
//   node --experimental-strip-types scripts/qa/bottom-row.ts <snapshot.txt> \
//     --newest "Leo Martins, send pics" [--scale 1] [--platform ios] \
//     [--field Message] [--min-gap 8] [--tolerance 1]
//
// Rects in the dump are window coordinates, in the dump's own units:
// points on iOS. `--scale` is how many raw units make a logical point
// (an Android dump in pixels needs the device's density, passed in;
// nothing here guesses it). Exit 0: the gap is at least `--min-gap`
// (less `--tolerance`); 1: the row is closer or under the composer;
// 2: the dump can't answer (no such row, duplicates, no composer bar, an
// invalid rect, an unsupported platform). It never falls back to another
// row: a newest row that's hidden or missing is an error, not a pass.
// With the keyboard up (iOS's `UIKeyboardItemContainerView` or `Keyboard`
// node in the dump), the bar may end at the keyboard's top instead of the
// window's bottom.
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SnapshotNode {
  readonly index: number;
  readonly parentIndex?: number;
  readonly type?: string;
  readonly role?: string;
  readonly label?: string;
  readonly rect: Rect;
  readonly hittable?: boolean;
  readonly kind?: string;
}

export class SnapshotError extends Error {}

function validRect(rect: unknown): rect is Rect {
  if (typeof rect !== "object" || rect === null) return false;
  const values = ["x", "y", "width", "height"].map((key) =>
    Reflect.get(rect, key),
  );
  return (
    values.every(
      (value) => typeof value === "number" && Number.isFinite(value),
    ) &&
    Number(Reflect.get(rect, "width")) >= 0 &&
    Number(Reflect.get(rect, "height")) >= 0
  );
}

/** The dump's nodes: one JSON object a line, after its header lines. */
export function parseSnapshot(text: string) {
  const nodes = new Map<number, SnapshotNode>();
  for (const [number, line] of text.split("\n").entries()) {
    if (!line.startsWith("{")) continue;
    const node: unknown = JSON.parse(line);
    if (typeof node !== "object" || node === null) continue;
    const rect: unknown = Reflect.get(node, "rect");
    const index: unknown = Reflect.get(node, "index");
    if (typeof index !== "number") {
      throw new SnapshotError(`line ${number + 1}: a node with no index`);
    }
    if (!validRect(rect)) {
      throw new SnapshotError(
        `line ${number + 1}: node ${index} has an invalid rect`,
      );
    }
    nodes.set(index, node as SnapshotNode);
  }
  if (nodes.size === 0) throw new SnapshotError("no nodes in the snapshot");
  return nodes;
}

/** iOS's native list draws each message as a `MessageList.MessageCell`. */
function isMessageRow(node: SnapshotNode) {
  return node.role === "MessageList.MessageCell";
}

/** The composer's field: a text view or field labelled like it. */
function isField(node: SnapshotNode, label: string) {
  const editable =
    node.type === "TextView" ||
    node.type === "TextField" ||
    node.role === "RCTUITextView" ||
    node.role === "RCTUITextField";
  return editable && (node.label ?? "").startsWith(label);
}

const bottom = (rect: Rect) => rect.y + rect.height;

/**
 * The keyboard's top, if it's up: iOS's keyboard container
 * (`UIKeyboardItemContainerView`, its accessory bar included) or the keys
 * (`type` "Keyboard"), whichever is higher.
 */
function keyboardTopOf(nodes: readonly SnapshotNode[]) {
  const tops = nodes
    .filter(
      (node) =>
        node.role === "UIKeyboardItemContainerView" || node.type === "Keyboard",
    )
    .filter((node) => node.rect.height > 0)
    .map((node) => node.rect.y);
  return tops.length === 0 ? undefined : Math.min(...tops);
}

function ancestors(
  nodes: ReadonlyMap<number, SnapshotNode>,
  node: SnapshotNode,
) {
  const chain: SnapshotNode[] = [];
  let parent = node.parentIndex;
  while (parent !== undefined) {
    const next = nodes.get(parent);
    if (next === undefined) break;
    chain.push(next);
    parent = next.parentIndex;
  }
  return chain;
}

function scaled(rect: Rect, scale: number) {
  return {
    height: rect.height / scale,
    width: rect.width / scale,
    x: rect.x / scale,
    y: rect.y / scale,
  } satisfies Rect;
}

export interface Options {
  readonly newest: string;
  readonly scale?: number;
  readonly platform?: string;
  readonly field?: string;
  readonly minGap?: number;
  readonly tolerance?: number;
}

/**
 * The newest row against the composer bar: the full-width ancestor of the
 * composer's field that reaches the window's bottom, not the field itself
 * (the field sits inside the bar's padding).
 */
export function bottomRow(
  nodes: ReadonlyMap<number, SnapshotNode>,
  {
    newest,
    scale = 1,
    platform = "ios",
    field = "Message",
    minGap = 8,
    tolerance = 1,
  }: Options,
) {
  if (platform !== "ios") {
    throw new SnapshotError(
      `${platform} snapshots aren't supported yet: no real ${platform} dump has been captured to read its node shape from`,
    );
  }
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new SnapshotError(`--scale must be a positive number, not ${scale}`);
  }
  const all = [...nodes.values()];
  const window =
    all.find((node) => node.type === "Window") ??
    all.find((node) => node.index === 0);
  if (window === undefined) throw new SnapshotError("no window node");
  const rows = all.filter(isMessageRow);
  const matches = rows.filter((node) => (node.label ?? "").startsWith(newest));
  if (matches.length === 0) {
    throw new SnapshotError(
      `no message row starts with "${newest}": the newest row is missing or hidden, and no other row stands in for it`,
    );
  }
  if (matches.length > 1) {
    throw new SnapshotError(
      `${matches.length} message rows start with "${newest}" (indexes ${matches.map((node) => node.index).join(", ")}): make it unique`,
    );
  }
  const [row] = matches;
  if (row === undefined) throw new SnapshotError("no row");
  const lower = rows.filter(
    (node) => bottom(node.rect) > bottom(row.rect) + 0.5,
  );
  if (lower.length > 0) {
    throw new SnapshotError(
      `"${newest}" isn't the bottom message row: ${lower.map((node) => `"${node.label ?? node.index}"`).join(", ")} sits below it`,
    );
  }
  const fields = all.filter((node) => isField(node, field));
  if (fields.length !== 1) {
    throw new SnapshotError(
      `${fields.length === 0 ? "no" : String(fields.length)} composer field${fields.length === 1 ? "" : "s"} labelled "${field}"`,
    );
  }
  const [input] = fields;
  if (input === undefined) throw new SnapshotError("no field");
  const windowBottom = bottom(window.rect);
  const keyboardTop = keyboardTopOf(all);
  // Outermost first: the bar is the widest full-width ancestor, shorter
  // than the window, that ends at the window's bottom, or with the
  // keyboard up, reaches down to the keyboard (its bottom inset goes
  // behind it).
  const bar = ancestors(nodes, input)
    .reverse()
    .find(
      (node) =>
        Math.abs(node.rect.x - window.rect.x) <= 0.5 &&
        Math.abs(node.rect.width - window.rect.width) <= 0.5 &&
        node.rect.height < window.rect.height - 0.5 &&
        node.rect.y <= input.rect.y &&
        bottom(node.rect) >= bottom(input.rect) &&
        (Math.abs(bottom(node.rect) - windowBottom) <= 0.5 ||
          (keyboardTop !== undefined &&
            node.rect.y < keyboardTop &&
            bottom(node.rect) >= keyboardTop - 0.5)),
    );
  if (bar === undefined) {
    throw new SnapshotError(
      `the "${field}" field has no full-width ancestor at the window's bottom${keyboardTop === undefined ? "" : " or the keyboard's top"}: not the composer bar`,
    );
  }
  const rowRect = scaled(row.rect, scale);
  const barRect = scaled(bar.rect, scale);
  const gap = barRect.y - bottom(rowRect);
  const hittable = all.filter(
    (node) =>
      node.hittable === true &&
      ancestors(nodes, node).some((parent) => parent.index === row.index),
  ).length;
  return {
    composer: {
      index: bar.index,
      rawRect: bar.rect,
      rect: barRect,
      role: bar.role,
      top: barRect.y,
    },
    field: { index: input.index, rect: scaled(input.rect, scale) },
    gap,
    keyboard: keyboardTop === undefined ? null : { top: keyboardTop / scale },
    minGap,
    ok: gap >= minGap - tolerance,
    overlap: Math.max(0, -gap),
    row: {
      // All of it at or below the composer's top: scrolled away, or out
      // of sight behind the composer and keyboard.
      belowComposer: rowRect.y >= barRect.y,
      bottom: bottom(rowRect),
      hittable: row.hittable ?? null,
      hittableDescendants: hittable,
      index: row.index,
      label: row.label,
      rawRect: row.rect,
      rect: rowRect,
    },
    // `rawRect`s are in the snapshot's own units; the rest are those
    // divided by `scale`, in logical points.
    units: { logical: "pt", raw: "snapshot", scale },
  };
}

function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      field: { type: "string" },
      "min-gap": { type: "string" },
      newest: { type: "string" },
      platform: { type: "string" },
      scale: { type: "string" },
      tolerance: { type: "string" },
    },
  });
  const [file] = positionals;
  if (file === undefined || values.newest === undefined) {
    console.error(
      'usage: bottom-row.ts <snapshot.txt> --newest "<label start>" [--scale 1] [--platform ios]',
    );
    process.exit(2);
  }
  try {
    const report = bottomRow(parseSnapshot(readFileSync(file, "utf8")), {
      field: values.field,
      minGap:
        values["min-gap"] === undefined ? undefined : Number(values["min-gap"]),
      newest: values.newest,
      platform: values.platform,
      scale: values.scale === undefined ? undefined : Number(values.scale),
      tolerance:
        values.tolerance === undefined ? undefined : Number(values.tolerance),
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    if (!(error instanceof SnapshotError) && !(error instanceof SyntaxError))
      throw error;
    console.error(`bottom-row: ${error.message}`);
    process.exit(2);
  }
}

if (import.meta.main) main();
