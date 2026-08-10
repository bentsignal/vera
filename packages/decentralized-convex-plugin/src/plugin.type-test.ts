import { composePlugins, defineCapability, definePlugin } from "./index.ts";

interface AccountsService {
  readonly kind: "accounts";
}

interface MessagingService {
  readonly kind: "messaging";
}

const AccountsV1 = defineCapability<AccountsService>()({
  id: "accounts",
  version: "1",
});
const AccountsV2 = defineCapability<AccountsService>()({
  id: "accounts",
  version: "2",
});
const Messaging = defineCapability<MessagingService>()({
  id: "messaging",
  version: "1",
});

const accountsV1Plugin = definePlugin({
  name: "accounts-v1",
  provides: [AccountsV1],
  requires: [],
  setup: () => [{ kind: "accounts" }],
});
const accountsV2Plugin = definePlugin({
  name: "accounts-v2",
  provides: [AccountsV2],
  requires: [],
  setup: () => [{ kind: "accounts" }],
});
const alternativeAccountsV1Plugin = definePlugin({
  name: "alternative-accounts-v1",
  provides: [AccountsV1],
  requires: [],
  setup: () => [{ kind: "accounts" }],
});
const messagingPlugin = definePlugin({
  name: "messaging",
  provides: [Messaging],
  requires: [AccountsV1],
  setup: ({ get }) => {
    get(AccountsV1);
    return [{ kind: "messaging" }];
  },
});

const app = composePlugins(messagingPlugin, accountsV1Plugin);
const accounts: AccountsService = app.get(AccountsV1);
const messaging: MessagingService = app.get(Messaging);
void accounts;
void messaging;

// @ts-expect-error -- the messaging dependency is absent.
composePlugins(messagingPlugin);

// @ts-expect-error -- accounts@2 does not satisfy the accounts@1 requirement.
composePlugins(accountsV2Plugin, messagingPlugin);

// @ts-expect-error -- only one plugin may provide a capability ID.
composePlugins(accountsV1Plugin, alternativeAccountsV1Plugin);

// @ts-expect-error -- the application did not install accounts@2.
app.get(AccountsV2);
