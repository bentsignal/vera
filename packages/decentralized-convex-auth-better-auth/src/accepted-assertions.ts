import type { VerifiedAssertion } from "./federation-plugin.ts";

// Remembering the federation assertions this PDS has accepted, so each one
// signs a visitor in once (`exchangeFederationAssertion`).

/** Where accepted assertions are remembered, in Better Auth's verifications. */
const ACCEPTED_PREFIX = "pds-federation-assertion:";

/** The part of Better Auth's database adapter `acceptOnce` uses. */
export interface AssertionStore {
  create(input: {
    data: Record<string, unknown>;
    model: string;
  }): Promise<unknown>;
  deleteMany(input: {
    model: string;
    where: {
      field: string;
      operator?: "lt" | "starts_with";
      value: Date | string;
    }[];
  }): Promise<unknown>;
  findMany(input: {
    model: string;
    where: { field: string; value: string }[];
  }): Promise<readonly unknown[]>;
}

/**
 * Remembers an assertion until it expires and says whether this is its
 * first use. Two copies arriving at once can both be refused, never both
 * accepted: each is written first, then accepted only if it's the only
 * one there.
 */
export async function acceptOnce(
  store: AssertionStore,
  {
    expiresAt,
    homeDomain,
    id,
  }: Pick<VerifiedAssertion, "expiresAt" | "homeDomain" | "id">,
) {
  const now = new Date();
  // Forget the ones that have expired, which can't be used again anyway.
  await store.deleteMany({
    model: "verification",
    where: [
      { field: "expiresAt", operator: "lt", value: now },
      { field: "identifier", operator: "starts_with", value: ACCEPTED_PREFIX },
    ],
  });
  const identifier = `${ACCEPTED_PREFIX}${homeDomain}:${id}`;
  await store.create({
    data: {
      createdAt: now,
      expiresAt: new Date(expiresAt * 1_000),
      identifier,
      updatedAt: now,
      value: "accepted",
    },
    model: "verification",
  });
  const copies = await store.findMany({
    model: "verification",
    where: [{ field: "identifier", value: identifier }],
  });
  return copies.length === 1;
}
