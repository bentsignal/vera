import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PAGE_BAND,
  pagePosition,
  pagesAround,
  pageTarget,
} from "./photo-pager.ts";

const WIDTH = 400;

void test("a page follows the finger one for one", () => {
  assert.equal(pagePosition(1, -100, WIDTH, 3), 1.25);
  assert.equal(pagePosition(1, 200, WIDTH, 3), 0.5);
});

void test("past the first and last pages it stops a quarter page out", () => {
  assert.equal(pagePosition(0, 1000, WIDTH, 3), -PAGE_BAND);
  assert.equal(pagePosition(2, -1000, WIDTH, 3), 2 + PAGE_BAND);
  assert.equal(pagePosition(0, 40, WIDTH, 3), -0.1);
});

void test("let go, a swipe turns the page past a third or with a flick", () => {
  const swipe = { count: 3, from: 1, width: WIDTH };
  assert.equal(pageTarget({ ...swipe, dx: -150, speedX: 0 }), 2);
  assert.equal(pageTarget({ ...swipe, dx: 150, speedX: 0 }), 0);
  assert.equal(pageTarget({ ...swipe, dx: -60, speedX: 0 }), 1);
  assert.equal(pageTarget({ ...swipe, dx: -20, speedX: -900 }), 2);
});

void test("it never goes past the first or last page", () => {
  const swipe = { count: 3, width: WIDTH };
  assert.equal(pageTarget({ ...swipe, dx: 300, from: 0, speedX: 900 }), 0);
  assert.equal(pageTarget({ ...swipe, dx: -300, from: 2, speedX: -900 }), 2);
});

void test("the shown page and its neighbors are mounted", () => {
  assert.deepEqual(pagesAround(0, 4), [0, 1]);
  assert.deepEqual(pagesAround(2, 4), [1, 2, 3]);
  assert.deepEqual(pagesAround(3, 4), [2, 3]);
  assert.deepEqual(pagesAround(0, 1), [0]);
});

void test("a swipe that catches the last one's spring carries on from there", () => {
  // The spring from page 1 to 2 is at 1.6 when the finger lands.
  assert.ok(Math.abs(pagePosition(1.6, -40, WIDTH, 3) - 1.7) < 1e-9);
  const caught = { count: 4, from: 1.6, width: WIDTH };
  // Barely moved: on to page 2, where it was going.
  assert.equal(pageTarget({ ...caught, dx: -10, speedX: 0 }), 2);
  // Dragged back past a third: page 1.
  assert.equal(pageTarget({ ...caught, dx: 200, speedX: 0 }), 1);
  // Dragged back less, but past the middle: the nearest, page 1.
  assert.equal(pageTarget({ ...caught, dx: 120, speedX: 0 }), 1);
  // Flicked on again: page 3, not 2 twice.
  assert.equal(pageTarget({ ...caught, dx: -60, speedX: -900 }), 3);
  // Flicked back: page 1.
  assert.equal(pageTarget({ ...caught, dx: 40, speedX: 900 }), 1);
});
