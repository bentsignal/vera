import assert from "node:assert/strict";
import { test } from "node:test";

import {
  matchesPerson,
  searchedAddress,
  searchPeople,
} from "./people-match.ts";

const HOME = "dev.vera.chat";
const shawn = { address: "shawn@dev.vera.chat", displayName: "Shawn Rodgers" };

void test("a partial address keeps matching the person", () => {
  for (const text of [
    "shawn",
    "Shawn@",
    "shawn@dev",
    "shawn@dev.vera",
    "shawn@dev.vera.chat",
    "@shawn",
  ]) {
    assert.ok(matchesPerson(text, shawn), text);
  }
});

void test("matches display names and the middle of a username", () => {
  assert.ok(matchesPerson("rodg", shawn));
  assert.ok(matchesPerson("shawn r", shawn));
  assert.ok(matchesPerson("awn", shawn));
});

void test("the domain alone, or a different one, doesn't match", () => {
  assert.ok(!matchesPerson("vera", shawn));
  assert.ok(!matchesPerson("dev.vera.chat", shawn));
  assert.ok(!matchesPerson("shawn@vera.chat", shawn));
  assert.ok(!matchesPerson("shawn@devx", shawn));
});

void test("completes a username and partial home domain to look up", () => {
  for (const text of [
    "shawn",
    "shawn@",
    "shawn@dev",
    "shawn@dev.vera",
    " Shawn@Dev.Vera.Chat ",
  ]) {
    assert.equal(searchedAddress(text, HOME), "shawn@dev.vera.chat", text);
  }
});

void test("other domains are looked up only when typed in full", () => {
  assert.equal(searchedAddress("maya@example.com", HOME), "maya@example.com");
  assert.equal(searchedAddress("maya@exam", HOME), null);
});

void test("text that can't be an address isn't looked up", () => {
  assert.equal(searchedAddress("s", HOME), null);
  assert.equal(searchedAddress("", HOME), null);
  assert.equal(searchedAddress("maya chen", HOME), null);
});

void test("one answer gives the matches and the lookup together", () => {
  const displayNames = new Map([
    ["maya@dev.vera.chat", "Maya Chen"],
    ["leo@dev.vera.chat", "Leo Martins"],
  ]);
  const people = {
    candidates: [...displayNames.keys()],
    displayNameOf: (address: string) => displayNames.get(address) ?? address,
    known: [...displayNames.keys()],
    picked: new Set(["leo@dev.vera.chat"]),
  };
  assert.deepEqual(searchPeople({ ...people, found: null, query: "" }), {
    newAddress: null,
    noResults: false,
    people: ["maya@dev.vera.chat"],
    searching: false,
  });
  assert.deepEqual(
    searchPeople({ ...people, found: "shawn@dev.vera.chat", query: "shawn@" }),
    {
      newAddress: "shawn@dev.vera.chat",
      noResults: false,
      people: [],
      searching: true,
    },
  );
  assert.deepEqual(searchPeople({ ...people, found: null, query: "leo m" }), {
    newAddress: null,
    noResults: false,
    people: ["leo@dev.vera.chat"],
    searching: true,
  });
  assert.equal(
    searchPeople({ ...people, found: null, query: "zed" }).noResults,
    true,
  );
});
