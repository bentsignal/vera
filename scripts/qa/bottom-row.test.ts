import assert from "node:assert/strict";
import { test } from "node:test";

import type { Rect } from "./bottom-row.ts";
import { bottomRow, parseSnapshot, SnapshotError } from "./bottom-row.ts";

// Synthetic snapshots in the shape `agent-device snapshot -i --raw` prints
// on iOS (see .cache/polish-ios-group-raw.txt): header lines, then one
// node a line, in window points.

interface Node {
  index: number;
  parentIndex?: number;
  type?: string;
  role?: string;
  label?: string;
  rect: Rect;
  hittable?: boolean;
}

function rect(x: number, y: number, width: number, height: number) {
  return { height, width, x, y };
}

/** A conversation: rows ending where given, the composer bar at 798. */
function snapshot({
  rows = [
    {
      bottom: 709,
      label: "Priya Natarajan, can't tonight, tomorrow?, 5:53 PM",
    },
    { bottom: 790, label: "Leo Martins, send pics, 5:53 PM" },
  ],
  barTop = 798,
  scale = 1,
  fieldInBar = true,
  barBottom = 874,
  keyboardTop,
}: {
  rows?: { bottom: number; label: string }[];
  barTop?: number;
  scale?: number;
  fieldInBar?: boolean;
  /** Where the bar ends: 874 (the window's bottom) unless the keyboard's up. */
  barBottom?: number;
  /** The keyboard's container's top, if it's up. */
  keyboardTop?: number;
} = {}) {
  const at = (value: number) => value * scale;
  const nodes: Node[] = [
    { index: 0, rect: rect(0, 0, at(402), at(874)), type: "Application" },
    {
      index: 1,
      parentIndex: 0,
      rect: rect(0, 0, at(402), at(874)),
      type: "Window",
    },
    {
      index: 2,
      parentIndex: 1,
      rect: rect(0, 0, at(402), at(874)),
      role: "MessageList.ListCollectionView",
      type: "CollectionView",
    },
  ];
  rows.forEach((row, offset) => {
    nodes.push({
      hittable: true,
      index: 10 + offset * 2,
      label: row.label,
      parentIndex: 2,
      rect: rect(0, at(row.bottom - 81), at(402), at(81)),
      role: "MessageList.MessageCell",
      type: "Cell",
    });
    nodes.push({
      hittable: true,
      index: 11 + offset * 2,
      parentIndex: 10 + offset * 2,
      rect: rect(at(68), at(row.bottom - 37), at(73), at(22)),
      role: "MessageList.TextView",
    });
  });
  // The bar: full width, down to the window's bottom, with the field in
  // its padding. Without `fieldInBar`, the field sits in a card mid-screen.
  nodes.push({
    index: 50,
    parentIndex: 1,
    rect: fieldInBar
      ? rect(0, at(barTop), at(402), at(barBottom - barTop))
      : rect(at(20), at(300), at(362), at(200)),
    role: "RCTViewComponentView",
  });
  nodes.push({
    index: 51,
    parentIndex: 50,
    rect: fieldInBar
      ? rect(at(76), at(barTop + 8), at(298), at(40))
      : rect(at(40), at(320), at(322), at(40)),
    role: "RCTViewComponentView",
  });
  nodes.push({
    index: 52,
    label: "Message Message",
    parentIndex: 51,
    rect: fieldInBar
      ? rect(at(76), at(barTop + 8), at(298), at(30))
      : rect(at(40), at(320), at(322), at(30)),
    role: "RCTUITextView",
    type: "TextView",
  });
  if (keyboardTop !== undefined) {
    nodes.push({
      index: 90,
      rect: rect(0, at(keyboardTop), at(402), at(874 - keyboardTop)),
      role: "UIKeyboardItemContainerView",
      type: "Other",
    });
  }
  return parseSnapshot(
    [
      "Page: chat.vera.app.dev",
      "Snapshot: n nodes",
      ...nodes.map((node) => JSON.stringify(node)),
    ].join("\n"),
  );
}

const NEWEST = "Leo Martins, send pics";

void test("the newest row 8 pt above the composer bar's top passes", () => {
  const report = bottomRow(snapshot(), { newest: NEWEST });
  assert.equal(report.row.bottom, 790);
  // The bar's top, not the field's (806).
  assert.equal(report.composer.top, 798);
  assert.equal(report.gap, 8);
  assert.equal(report.overlap, 0);
  assert.equal(report.ok, true);
  assert.equal(report.row.hittableDescendants, 1);
});

void test("a row under the composer reports its overlap and fails", () => {
  const report = bottomRow(snapshot({ barTop: 770 }), { newest: NEWEST });
  assert.equal(report.gap, -20);
  assert.equal(report.overlap, 20);
  assert.equal(report.ok, false);
  // Close but above, short of the 8 pt gap (less 1 of tolerance): fails.
  assert.equal(
    bottomRow(snapshot({ barTop: 796 }), { newest: NEWEST }).ok,
    false,
  );
  assert.equal(
    bottomRow(snapshot({ barTop: 797 }), { newest: NEWEST }).ok,
    true,
  );
});

void test("a missing newest row is an error, never an older row's pass", () => {
  assert.throws(
    () => bottomRow(snapshot(), { newest: "Maya Chen, on my way" }),
    (error) =>
      error instanceof SnapshotError && /missing or hidden/.test(error.message),
  );
});

void test("a newest row that isn't the bottom one is an error", () => {
  assert.throws(
    () => bottomRow(snapshot(), { newest: "Priya Natarajan" }),
    /isn't the bottom message row/,
  );
});

void test("two rows matching the newest label are an error", () => {
  const rows = [
    { bottom: 709, label: "Leo Martins, send pics, 5:52 PM" },
    { bottom: 790, label: "Leo Martins, send pics, 5:53 PM" },
  ];
  assert.throws(
    () => bottomRow(snapshot({ rows }), { newest: NEWEST }),
    /2 message rows/,
  );
});

void test("a field with no full-width ancestor at the bottom isn't the composer", () => {
  assert.throws(
    () => bottomRow(snapshot({ fieldInBar: false }), { newest: NEWEST }),
    /not the composer bar/,
  );
});

void test("raw units convert to points by the scale given", () => {
  // The same screen in pixels at 3x.
  const report = bottomRow(snapshot({ scale: 3 }), {
    newest: NEWEST,
    scale: 3,
  });
  // Raw: the row starts at 709 pt, 2127 px; in points it ends at 790.
  assert.equal(report.row.rawRect.y, 709 * 3);
  assert.equal(report.row.rawRect.height, 81 * 3);
  assert.equal(report.row.bottom, 790);
  assert.equal(report.composer.top, 798);
  assert.equal(report.gap, 8);
  // Read at the wrong scale, the gap is in pixels and says so.
  assert.equal(bottomRow(snapshot({ scale: 3 }), { newest: NEWEST }).gap, 24);
  assert.throws(
    () => bottomRow(snapshot(), { newest: NEWEST, scale: 0 }),
    /positive/,
  );
});

void test("invalid rects and unsupported platforms are errors", () => {
  const bad =
    '{"index":0,"type":"Window","rect":{"x":0,"y":0,"width":-1,"height":10}}';
  assert.throws(() => parseSnapshot(bad), /invalid rect/);
  assert.throws(
    () => bottomRow(snapshot(), { newest: NEWEST, platform: "android" }),
    /aren't supported yet/,
  );
});

void test("with the keyboard up, the bar ending at the keyboard is the composer", () => {
  // As measured: the bar 490 to 566, the keyboard from 546 (the bar's
  // bottom inset goes behind it), the newest row ending at 482.
  const keyboardUp = {
    barBottom: 566,
    barTop: 490,
    keyboardTop: 546,
    rows: [{ bottom: 482, label: "Leo Martins, send pics, 5:53 PM" }],
  };
  const report = bottomRow(snapshot(keyboardUp), { newest: NEWEST });
  assert.equal(report.composer.top, 490);
  assert.equal(report.gap, 8);
  assert.equal(report.ok, true);
  assert.deepEqual(report.keyboard, { top: 546 });
  // A bar ending above the window's bottom with no keyboard in the dump
  // isn't taken for the composer.
  assert.throws(
    () =>
      bottomRow(snapshot({ ...keyboardUp, keyboardTop: undefined }), {
        newest: NEWEST,
      }),
    /not the composer bar/,
  );
});

void test("a newest row scrolled below the composer says so, and fails", () => {
  const report = bottomRow(
    snapshot({
      barBottom: 566,
      barTop: 490,
      keyboardTop: 546,
      rows: [{ bottom: 934, label: "Leo Martins, send pics, 5:53 PM" }],
    }),
    { newest: NEWEST },
  );
  assert.equal(report.row.belowComposer, true);
  assert.equal(report.ok, false);
});
