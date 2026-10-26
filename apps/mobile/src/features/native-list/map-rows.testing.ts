import assert from "node:assert/strict";

import type { Message } from "../conversation/types.ts";
import type { Block, MessageRow, Row } from "./contract.ts";
import type { RowContext } from "./map-rows.ts";
import { newestFirst } from "../conversation/build-rows.ts";
import { V1_BLOCK_TYPES, V1_ROW_KINDS } from "./contract.ts";
import { nativeRows } from "./map-rows.ts";

// Messages and helpers for map-rows.test.ts.

export const ME = "me@vera.test";
export const MAYA = "maya@vera.test";
export const LEO = "leo@vera.test";
export const START = new Date(2026, 9, 22, 9, 0).getTime();

const NAMES = new Map([
  [LEO, "Leo Park"],
  [MAYA, "Maya Chen"],
  [ME, "Me"],
]);

export function context(overrides: Partial<RowContext> = {}) {
  return {
    layout: "bubbles",
    now: new Date(START + 60 * 60_000),
    openedAt: START + 30 * 60_000,
    profileOf: (address: string) => ({
      avatarUrl: address === LEO ? "https://example.com/leo.jpg" : null,
      displayName: NAMES.get(address) ?? address,
    }),
    self: ME,
    showAuthors: true,
    support: { blockTypes: V1_BLOCK_TYPES, rowKinds: V1_ROW_KINDS },
    ...overrides,
  } satisfies RowContext;
}

export function message(
  id: string,
  minute: number,
  extra: Partial<Message> = {},
) {
  return {
    attachments: [],
    authorId: MAYA,
    body: id,
    id,
    reactions: [],
    sentAt: new Date(START + minute * 60_000),
    ...extra,
  } satisfies Message;
}

export function photo(name: string, width = 1200, height = 900) {
  return {
    height,
    kind: "image" as const,
    mimeType: "image/jpeg",
    name,
    size: 1000,
    url: `https://example.com/${name}`,
    width,
  };
}

export function rowsOf(
  messages: readonly Message[],
  overrides: Partial<RowContext> = {},
  typists: readonly string[] = [],
) {
  const shown = context(overrides);
  return nativeRows(
    newestFirst(messages, shown.layout, undefined),
    typists,
    shown,
  );
}

export function isMessage(row: Row): row is MessageRow {
  return row.kind === "message";
}

export function messageRows(rows: readonly Row[]) {
  return rows.filter(isMessage);
}

export function at<Value>(values: readonly Value[], index: number) {
  const value = values[index];
  assert.ok(value !== undefined, `nothing at ${index}`);
  return value;
}

export function only<Value>(values: readonly Value[]) {
  assert.equal(values.length, 1);
  return at(values, 0);
}

export function isBlock<Type extends Block["type"]>(
  block: Block,
  type: Type,
): block is Extract<Block, { type: Type }> {
  return block.type === type;
}

/** A message row's block of a type, at `index`. */
export function blockAt<Type extends Block["type"]>(
  row: MessageRow,
  index: number,
  type: Type,
) {
  const block = at(row.blocks, index);
  assert.ok(isBlock(block, type), `block ${index} is ${type}`);
  return block;
}

function isKind<Kind extends Row["kind"]>(
  row: Row,
  kind: Kind,
): row is Extract<Row, { kind: Kind }> {
  return row.kind === kind;
}

/** A row of a kind, at `index`. */
export function rowAt<Kind extends Row["kind"]>(
  rows: readonly Row[],
  index: number,
  kind: Kind,
) {
  const row = at(rows, index);
  assert.ok(isKind(row, kind), `row ${index} is ${kind}`);
  return row;
}
