import assert from "node:assert/strict";
import { test } from "node:test";

import { authorsShownIn } from "./list-props.ts";
import {
  LEO,
  MAYA,
  ME,
  message,
  messageRows,
  rowsOf,
} from "./map-rows.testing.ts";

// Someone in a direct message who isn't one of its two members: Vera,
// when either of them @mentions it (services/backend/convex/summons.ts).
// From then on it reads like a group, so every sender is named.

const direct = { kind: "direct" as const, members: [ME, MAYA] };

void test("direct chats name no one while it's just the two of them", () => {
  const rows = messageRows(
    rowsOf(
      [message("a", 0), message("b", 10, { authorId: ME })],
      authorsShownIn(direct),
    ),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.showAuthor]),
    [
      ["b", false],
      ["a", false],
    ],
  );
});

void test("once someone else is there, like Vera, direct chats name everyone", () => {
  const rows = messageRows(
    rowsOf(
      [
        message("a", 0),
        message("b", 5, { authorId: LEO }),
        message("c", 10, { authorId: ME }),
      ],
      authorsShownIn(direct),
    ),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.showAuthor]),
    [
      ["c", false],
      ["b", true],
      ["a", true],
    ],
  );
});

void test("Vera typing in a direct chat names everyone", () => {
  const [typing, row] = rowsOf([message("a", 0)], authorsShownIn(direct), [
    LEO,
  ]);
  assert.equal(typing?.kind === "typing" && typing.showFaces, true);
  assert.equal(row?.kind === "message" && row.showAuthor, true);
});

void test("groups and channels name everyone but you", () => {
  assert.deepEqual(authorsShownIn({ kind: "group", members: [ME, MAYA] }), {
    showAuthors: true,
  });
  assert.deepEqual(authorsShownIn(undefined), { showAuthors: true });
});
