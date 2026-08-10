import assert from "node:assert/strict";
import test from "node:test";

import {
  composePlugins,
  defineCapability,
  definePlugin,
  inspectPluginGraph,
  PluginGraphError,
} from "./index.ts";

interface AccountProfile {
  readonly address: string;
  readonly avatarUrl: string;
  readonly displayName: string;
}

interface AccountsService {
  getProfile(address: string): AccountProfile;
  resolveProfile(
    address: string,
    override?: Partial<Pick<AccountProfile, "avatarUrl" | "displayName">>,
  ): AccountProfile;
}

interface Message {
  readonly author: AccountProfile;
  readonly body: string;
}

interface MessagingService {
  createMessage(input: {
    readonly author: string;
    readonly body: string;
    readonly profile?: Partial<
      Pick<AccountProfile, "avatarUrl" | "displayName">
    >;
  }): Message;
}

interface GifMessagingService {
  createGifMessage(input: {
    readonly author: string;
    readonly gifUrl: string;
  }): Message;
}

interface ProductProfilesService {
  getProfile(address: string): AccountProfile;
}

const Accounts = defineCapability<AccountsService>()({
  id: "org.decentralized-convex.accounts",
  version: "1",
});

const Messaging = defineCapability<MessagingService>()({
  id: "org.decentralized-convex.messaging",
  version: "1",
});

const GifMessaging = defineCapability<GifMessagingService>()({
  id: "org.decentralized-convex.messaging.gifs",
  version: "1",
});

const VeraProfiles = defineCapability<ProductProfilesService>()({
  id: "chat.vera.profiles",
  version: "1",
});

const accountProfiles = new Map<string, AccountProfile>([
  [
    "shawn@rogers.dev",
    {
      address: "shawn@rogers.dev",
      avatarUrl: "https://rogers.dev/shawn.png",
      displayName: "Shawn Rogers",
    },
  ],
]);

function getAccountProfile(address: string) {
  const profile = accountProfiles.get(address);
  if (!profile) {
    throw new Error(`Unknown account: ${address}`);
  }
  return profile;
}

const accountsService: AccountsService = {
  getProfile: getAccountProfile,
  resolveProfile: (address, override) => ({
    ...getAccountProfile(address),
    ...override,
  }),
};

const accountsPlugin = definePlugin({
  name: "accounts",
  provides: [Accounts],
  requires: [],
  setup: () => [accountsService],
});

const messagingPlugin = definePlugin({
  name: "messaging",
  provides: [Messaging],
  requires: [Accounts],
  setup: ({ get }) => {
    const accounts = get(Accounts);
    return [
      {
        createMessage: ({ author, body, profile }) => ({
          author: accounts.resolveProfile(author, profile),
          body,
        }),
      },
    ];
  },
});

const gifMessagingPlugin = definePlugin({
  name: "messaging-gifs",
  provides: [GifMessaging],
  requires: [Messaging],
  setup: ({ get }) => {
    const messaging = get(Messaging);
    return [
      {
        createGifMessage: ({ author, gifUrl }) =>
          messaging.createMessage({ author, body: `[gif](${gifUrl})` }),
      },
    ];
  },
});

const veraProfilesPlugin = definePlugin({
  name: "vera-profiles",
  provides: [VeraProfiles],
  requires: [Accounts],
  setup: ({ get }) => {
    const accounts = get(Accounts);
    return [
      {
        getProfile: (address) =>
          accounts.resolveProfile(address, { displayName: "Shawn on Vera" }),
      },
    ];
  },
});

void test("resolves plugins by dependency and supports profile overrides", () => {
  const app = composePlugins(
    gifMessagingPlugin,
    veraProfilesPlugin,
    messagingPlugin,
    accountsPlugin,
  );
  const messaging = app.get(Messaging);
  const gifs = app.get(GifMessaging);
  const veraProfiles = app.get(VeraProfiles);

  assert.deepEqual(
    messaging.createMessage({
      author: "shawn@rogers.dev",
      body: "hello",
      profile: veraProfiles.getProfile("shawn@rogers.dev"),
    }),
    {
      author: {
        address: "shawn@rogers.dev",
        avatarUrl: "https://rogers.dev/shawn.png",
        displayName: "Shawn on Vera",
      },
      body: "hello",
    },
  );
  assert.equal(
    gifs.createGifMessage({
      author: "shawn@rogers.dev",
      gifUrl: "https://media.example/wave.gif",
    }).body,
    "[gif](https://media.example/wave.gif)",
  );
  assert.deepEqual(
    app.manifest().map(({ name }) => name),
    ["accounts", "messaging", "messaging-gifs", "vera-profiles"],
  );
});

void test("reports missing and incompatible dependencies", () => {
  const AccountsV2 = defineCapability<AccountsService>()({
    id: "org.decentralized-convex.accounts",
    version: "2",
  });
  const accountsV2Plugin = definePlugin({
    name: "accounts-v2",
    provides: [AccountsV2],
    requires: [],
    setup: () => [accountsService],
  });

  assert.deepEqual(inspectPluginGraph([messagingPlugin]), [
    {
      capabilityId: "org.decentralized-convex.accounts",
      code: "missing-provider",
      plugin: "messaging",
      requiredVersion: "1",
    },
  ]);
  assert.deepEqual(inspectPluginGraph([accountsV2Plugin, messagingPlugin]), [
    {
      capabilityId: "org.decentralized-convex.accounts",
      code: "incompatible-version",
      plugin: "messaging",
      providedVersions: ["2"],
      requiredVersion: "1",
    },
  ]);
});

void test("reports duplicate providers and dependency cycles", () => {
  const alternativeAccountsPlugin = definePlugin({
    name: "alternative-accounts",
    provides: [Accounts],
    requires: [],
    setup: () => [accountsService],
  });
  const CapabilityA = defineCapability<{ readonly value: "a" }>()({
    id: "example.a",
    version: "1",
  });
  const CapabilityB = defineCapability<{ readonly value: "b" }>()({
    id: "example.b",
    version: "1",
  });
  const pluginA = definePlugin({
    name: "a",
    provides: [CapabilityA],
    requires: [CapabilityB],
    setup: () => [{ value: "a" }],
  });
  const pluginB = definePlugin({
    name: "b",
    provides: [CapabilityB],
    requires: [CapabilityA],
    setup: () => [{ value: "b" }],
  });

  assert.deepEqual(
    inspectPluginGraph([accountsPlugin, alternativeAccountsPlugin]),
    [
      {
        capabilityId: "org.decentralized-convex.accounts",
        code: "duplicate-provider",
        plugins: ["accounts", "alternative-accounts"],
      },
    ],
  );
  assert.deepEqual(inspectPluginGraph([pluginA, pluginB]), [
    { code: "dependency-cycle", plugins: ["a", "b", "a"] },
  ]);
  assert.throws(
    () => composePlugins(pluginA, pluginB),
    (error: unknown) =>
      error instanceof PluginGraphError &&
      error.issues[0]?.code === "dependency-cycle",
  );
});
