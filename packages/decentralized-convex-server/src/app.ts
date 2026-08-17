import type {
  AnyPluginProtocol,
  ProtocolGraphConstraint,
} from "@decentralized-convex/plugin";
import type { ComponentDefinition } from "convex/server";
import {
  DECENTRALIZED_CONVEX_LAST_CHANGED,
  DECENTRALIZED_CONVEX_VERSION,
} from "@decentralized-convex/core";
import { defineProtocolSet } from "@decentralized-convex/plugin";
import { defineApp } from "convex/server";

import type { FederationDescriptor } from "./descriptor.ts";

type AppDefinition = ReturnType<typeof defineApp>;

declare const pdsPluginProtocol: unique symbol;
declare const pdsAppPlugins: unique symbol;

const localComponentProtocols = new WeakMap<object, AnyPluginProtocol>();
const localAppProtocols = new WeakMap<object, readonly AnyPluginProtocol[]>();

/**
 * A normal Convex Component whose TypeScript type carries its PDS protocol.
 * The protocol marker is type-only because Convex replaces imported Component
 * definitions with its own runtime references while evaluating convex.config.
 */
export type PdsPluginComponent<
  Protocol extends AnyPluginProtocol,
  Definition extends ComponentDefinition = ComponentDefinition,
> = Definition & {
  readonly [pdsPluginProtocol]: Protocol;
};

export type AnyPdsPluginComponent = PdsPluginComponent<AnyPluginProtocol>;

export type PluginProtocolOf<Component> =
  Component extends PdsPluginComponent<infer Protocol> ? Protocol : never;

export type PluginProtocolsOf<
  Components extends readonly AnyPdsPluginComponent[],
> = {
  readonly [Index in keyof Components]: PluginProtocolOf<Components[Index]>;
};

type PdsPluginGraphDiagnostics<
  Components extends readonly AnyPdsPluginComponent[],
> = Omit<
  ProtocolGraphConstraint<PluginProtocolsOf<Components>>,
  keyof PluginProtocolsOf<Components>
>;

export type PdsAppDefinition<Plugins extends readonly AnyPdsPluginComponent[]> =
  AppDefinition & {
    readonly [pdsAppPlugins]: Plugins;
  };

export type PdsPluginsOf<App> =
  App extends PdsAppDefinition<infer Plugins> ? Plugins : never;

export type PdsProtocolsOf<App> = PluginProtocolsOf<PdsPluginsOf<App>>;

export interface ComponentInstall {
  readonly component: ComponentDefinition;
  readonly options?: {
    readonly httpPrefix?: string;
    readonly name?: string;
  };
}

export interface PdsAppOptions<
  Plugins extends readonly AnyPdsPluginComponent[],
> {
  readonly app?: { readonly httpPrefix?: string };
  readonly components?: readonly (ComponentDefinition | ComponentInstall)[];
  readonly plugins: Plugins & PdsPluginGraphDiagnostics<NoInfer<Plugins>>;
}

/**
 * Associates a Component with its protocol in the type system without adding
 * runtime properties that Convex would strip from imported definitions.
 */
export function definePdsPluginComponent<
  const Protocol extends AnyPluginProtocol,
  Definition extends ComponentDefinition,
>(
  component: Definition,
  protocol: Protocol,
): PdsPluginComponent<Protocol, Definition> {
  localComponentProtocols.set(component, protocol);
  // The marker is intentionally type-only; the runtime value remains the exact Component.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return component as PdsPluginComponent<Protocol, Definition>;
}

/**
 * Reads the runtime protocols collected when an application imports its PDS
 * config outside Convex, for example from its browser-facing API module.
 */
export function protocolsFromPdsApp<
  App extends PdsAppDefinition<readonly AnyPdsPluginComponent[]>,
>(app: App): PdsProtocolsOf<App> {
  const protocols = localAppProtocols.get(app);
  if (protocols === undefined) {
    throw new Error(
      "PDS protocols are unavailable. Import the application's local PDS config before creating its client API.",
    );
  }
  // The app and protocol tuple are registered together by definePdsApp.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return protocols as PdsProtocolsOf<App>;
}

/**
 * Creates a normal Convex app and installs typed PDS plugin Components.
 * Plugin dependency compatibility is checked by TypeScript from the protocol
 * types carried by each Component's default export.
 */
export function definePdsApp<
  const Plugins extends readonly AnyPdsPluginComponent[],
>({
  app: appOptions,
  components = [],
  plugins,
}: PdsAppOptions<Plugins>): PdsAppDefinition<Plugins> {
  const app = defineApp(appOptions);
  for (const install of components) {
    if (isComponentInstall(install)) {
      if (isImportedComponent(install.component)) {
        app.use(install.component, install.options);
      }
    } else if (isImportedComponent(install)) {
      app.use(install);
    }
  }

  const protocols: AnyPluginProtocol[] = [];
  for (const plugin of plugins) {
    const protocol = localComponentProtocols.get(plugin);
    if (protocol !== undefined) protocols.push(protocol);
    if (isImportedComponent(plugin)) app.use(plugin);
  }
  localAppProtocols.set(app, Object.freeze(protocols));
  // Installed plugin types are retained for downstream generated/client typing only.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return app as PdsAppDefinition<Plugins>;
}

export function protocolCapabilities<
  const Protocols extends readonly AnyPluginProtocol[],
>(...protocols: ProtocolGraphConstraint<Protocols>) {
  return defineProtocolSet(...protocols).map(({ lastChanged, name }) => ({
    id: name,
    lastChanged,
  }));
}

/** Release state used by discovery today and PDS upgrades in the future. */
export function pdsReleaseFromApp<
  App extends PdsAppDefinition<readonly AnyPdsPluginComponent[]>,
>(app: App) {
  const protocols = protocolsFromPdsApp(app);
  return Object.freeze({
    capabilities: protocols.map(({ lastChanged, name }) => ({
      id: name,
      lastChanged,
    })),
    lastChanged: DECENTRALIZED_CONVEX_LAST_CHANGED.protocol,
    version: DECENTRALIZED_CONVEX_VERSION,
  });
}

/** Builds a PDS descriptor without repeating release or plugin metadata. */
export function pdsDescriptorFromApp<
  App extends PdsAppDefinition<readonly AnyPdsPluginComponent[]>,
>(
  app: App,
  host: Omit<FederationDescriptor, "capabilities" | "lastChanged" | "version">,
): FederationDescriptor {
  return { ...host, ...pdsReleaseFromApp(app) };
}

function isComponentInstall(
  value: ComponentDefinition | ComponentInstall,
): value is ComponentInstall {
  return "component" in value;
}

function isImportedComponent(component: ComponentDefinition) {
  return "componentDefinitionPath" in component;
}
