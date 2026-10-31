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

const direct = { kind: "direct" as const, members: [ME, MAYA] };

void test("direct chats name anyone who isn't in them, like Vera", () => {
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
      ["a", false],
    ],
  );
});

void test("Vera typing in a direct chat shows its face", () => {
  const [typing] = rowsOf([message("a", 0)], authorsShownIn(direct), [LEO]);
  assert.equal(typing?.kind === "typing" && typing.showFaces, true);
});

void test("groups and channels name everyone but you", () => {
  assert.deepEqual(authorsShownIn({ kind: "group", members: [ME, MAYA] }), {
    showAuthors: true,
  });
  assert.deepEqual(authorsShownIn(undefined), { showAuthors: true });
});
