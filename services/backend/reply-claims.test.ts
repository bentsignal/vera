import assert from "node:assert/strict";
import { test } from "node:test";

import { claimsFiled, promisesToCheck } from "./reply-claims.ts";

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
