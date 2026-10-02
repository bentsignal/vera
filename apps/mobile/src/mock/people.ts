import type { Person } from "~/features/inbox/types";
import { env } from "~/env";

function person(id: string, displayName: string) {
  return {
    id,
    displayName,
    address: `${id}@${env.veraDomain}`,
  } satisfies Person;
}

export const me = person("shawn", "Shawn Rodgers");

export const people = [
  me,
  person("maya", "Maya Chen"),
  person("jonah", "Jonah Weiss"),
  person("priya", "Priya Natarajan"),
  person("leo", "Leo Martins"),
  person("ava", "Ava Okafor"),
  person("sam", "Sam Lindqvist"),
];

export function findPerson(id: string) {
  return people.find((candidate) => candidate.id === id);
}
