import assert from "node:assert/strict";
import { test } from "node:test";

import {
  claimsFiled,
  promisesToCheck,
  promisesUpdates,
} from "./reply-claims.ts";

void test("claimsFiled: saying a report went to the team, not asking", () => {
  // Said with nothing filed (2026-11-17 replays).
  assert.ok(
    claimsFiled([
      "Thanks, I passed it to the team as a bug report. I'll message you here when it's fixed.",
    ]),
  );
  assert.ok(
    claimsFiled([
      "Thanks, that's clear. I checked and nobody has reported this yet, so I'm sending it to the team now as a bug report.",
      "I'll message you here when it's fixed.",
    ]),
  );
  assert.ok(
    claimsFiled([
      "There's already a report for this. I've followed it, so I'll message you here when it's fixed.",
    ]),
  );
  // Asking first, and the notice, are fine.
  assert.ok(
    !claimsFiled([
      "Thanks, that's clear. Bug reports are posted publicly, without your name or personal details. OK if I send it to the team?",
    ]),
  );
  assert.ok(
    !claimsFiled([
      "Someone already reported this, and the team has it. I'll message you here when it's fixed.",
    ]),
  );
  assert.ok(!claimsFiled(["Try the following steps first."]));
});

void test("claimsFiled and promisesToCheck: curly apostrophes too", () => {
  // Kimi writes ’ (2026-11-17 replays).
  assert.ok(
    claimsFiled([
      "That matches a bug someone already reported, so the team has it and I’ve linked your experience to it.",
    ]),
  );
  assert.ok(claimsFiled(["It’s still open, so I’ve followed it for you."]));
  assert.ok(promisesToCheck(["I’ll check whether anyone reported it."]));
});

void test("promisesUpdates: word when it's fixed, not other help", () => {
  // Said after finding a report it never followed (2026-11-17 replays).
  assert.ok(
    promisesUpdates([
      "Someone already reported this one. It's still open, and I'll message you here when it's fixed. Want me to add anything?",
    ]),
  );
  assert.ok(promisesUpdates(["I’ll let you know once it’s resolved."]));
  assert.ok(!promisesUpdates(["I'll tell you how to fix it."]));
  assert.ok(!promisesUpdates(["Want me to message you here when it's fixed?"]));
});

void test("promisesToCheck: a reply that says it's about to look", () => {
  assert.ok(
    promisesToCheck([
      "Got it, the mute icon is misaligned in the channels list. Let me check whether someone has already reported it.",
    ]),
  );
  assert.ok(promisesToCheck(["I'll look that up for you."]));
  assert.ok(!promisesToCheck(["Let me know if it happens again."]));
  assert.ok(
    !promisesToCheck(["Passed it on. I'll message you here when it's fixed."]),
  );
});
