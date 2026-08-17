import { defineProtocolSet } from "./index.ts";

const accounts = { name: "accounts", requires: {}, version: "1" } as const;
const accountsV2 = { name: "accounts", requires: {}, version: "2" } as const;
const messages = {
  name: "messages",
  requires: { accounts: "1" },
  version: "1",
} as const;

defineProtocolSet(accounts, messages);

// @ts-expect-error -- messages explicitly requires accounts@1.
defineProtocolSet(messages);

// @ts-expect-error -- accounts@2 does not satisfy the accounts@1 requirement.
defineProtocolSet(accountsV2, messages);

// @ts-expect-error -- a deployment cannot install the same plugin twice.
defineProtocolSet(accounts, accounts);
