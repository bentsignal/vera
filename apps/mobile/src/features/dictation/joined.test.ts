import assert from "node:assert/strict";
import { test } from "node:test";

import { withDictation } from "./joined.ts";

void test("dictation fills an empty field", () => {
  assert.equal(withDictation("", "Running late."), "Running late.");
});

void test("a space separates dictation from what was typed", () => {
  assert.equal(
    withDictation("On my way", "be there in ten"),
    "On my way be there in ten",
  );
});

void test("no second space after one already typed, or after a new line", () => {
  assert.equal(withDictation("Hi ", "there"), "Hi there");
  assert.equal(withDictation("Hi\n", "there"), "Hi\nthere");
});

void test("nothing heard leaves the draft alone", () => {
  assert.equal(withDictation("Hi", "  "), "Hi");
});
