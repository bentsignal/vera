import type {
  AnyCapability,
  CapabilityKey,
  CapabilityService,
} from "./capability.ts";
import type {
  AnyPlugin,
  PluginContext,
  PluginProvisions,
  PluginRequirements,
} from "./plugin.ts";
import { readCapabilityService } from "./capability.ts";
import { assertPluginGraph } from "./graph.ts";

type PluginsRequirements<Plugins extends readonly AnyPlugin[]> =
  PluginRequirements<Plugins[number]>;

type PluginsProvisions<Plugins extends readonly AnyPlugin[]> = PluginProvisions<
  Plugins[number]
>;

type MatchingProvision<
  Requirement extends AnyCapability,
  Provisions extends AnyCapability,
> = Provisions extends AnyCapability
  ? Provisions["id"] extends Requirement["id"]
    ? Provisions["version"] extends Requirement["version"]
      ? Provisions
      : never
    : never
  : never;

type UnsatisfiedRequirements<
  Requirements extends AnyCapability,
  Provisions extends AnyCapability,
> = Requirements extends AnyCapability
  ? [MatchingProvision<Requirements, Provisions>] extends [never]
    ? Requirements
    : never
  : never;

type MissingRequirements<Plugins extends readonly AnyPlugin[]> =
  UnsatisfiedRequirements<
    PluginsRequirements<Plugins>,
    PluginsProvisions<Plugins>
  >;

type SameIdProvision<
  Requirement extends AnyCapability,
  Provisions extends AnyCapability,
> = Provisions extends AnyCapability
  ? Provisions["id"] extends Requirement["id"]
    ? Provisions
    : never
  : never;

type IncompatibleRequirements<Plugins extends readonly AnyPlugin[]> =
  MissingRequirements<Plugins> extends infer Requirement extends AnyCapability
    ? [SameIdProvision<Requirement, PluginsProvisions<Plugins>>] extends [never]
      ? never
      : Requirement
    : never;

type AbsentRequirements<Plugins extends readonly AnyPlugin[]> = Exclude<
  MissingRequirements<Plugins>,
  IncompatibleRequirements<Plugins>
>;

type ProviderIds<Value extends AnyPlugin> = PluginProvisions<Value>["id"];

type DuplicateProviderIds<
  Plugins extends readonly AnyPlugin[],
  Seen extends string = never,
> = Plugins extends readonly [
  infer Head extends AnyPlugin,
  ...infer Tail extends readonly AnyPlugin[],
]
  ?
      | Extract<ProviderIds<Head>, Seen>
      | DuplicateProviderIds<Tail, Seen | ProviderIds<Head>>
  : never;

type PluginGraphConstraint<Plugins extends readonly AnyPlugin[]> = Plugins &
  ([AbsentRequirements<Plugins>] extends [never]
    ? unknown
    : {
        readonly __missingPluginRequirements: CapabilityKey<
          AbsentRequirements<Plugins>
        >;
      }) &
  ([IncompatibleRequirements<Plugins>] extends [never]
    ? unknown
    : {
        readonly __incompatiblePluginRequirements: CapabilityKey<
          IncompatibleRequirements<Plugins>
        >;
      }) &
  ([DuplicateProviderIds<Plugins>] extends [never]
    ? unknown
    : {
        readonly __duplicatePluginProviders: DuplicateProviderIds<Plugins>;
      });

export interface PluginManifestCapability {
  readonly id: string;
  readonly version: string;
}

export interface PluginManifestEntry {
  readonly name: string;
  readonly provides: readonly PluginManifestCapability[];
  readonly requires: readonly PluginManifestCapability[];
}

export interface PluginApp<Provisions extends AnyCapability> {
  readonly get: <Capability extends Provisions>(
    capability: Capability,
  ) => CapabilityService<Capability>;
  readonly manifest: () => readonly PluginManifestEntry[];
}

export function composePlugins<const Plugins extends readonly AnyPlugin[]>(
  ...plugins: PluginGraphConstraint<Plugins>
): PluginApp<PluginsProvisions<Plugins>> {
  const order = assertPluginGraph(plugins);
  const services = new Map<
    string,
    { readonly service: unknown; readonly version: string }
  >();

  const context: PluginContext<readonly AnyCapability[]> = {
    get: (capability) => {
      const provided = services.get(capability.id);
      if (provided?.version !== capability.version) {
        throw new Error(
          `Capability ${capability.id}@${capability.version} is not available during plugin setup.`,
        );
      }
      return readCapabilityService(capability, provided.service);
    },
  };

  for (const plugin of order) {
    const implementations = plugin.setup(context);
    if (implementations.length !== plugin.provides.length) {
      throw new Error(
        `Plugin ${plugin.name} declared ${plugin.provides.length} capabilities but returned ${implementations.length} implementations.`,
      );
    }
    plugin.provides.forEach((capability, index) => {
      services.set(capability.id, {
        service: implementations[index],
        version: capability.version,
      });
    });
  }

  return Object.freeze({
    get: <Capability extends PluginsProvisions<Plugins>>(
      capability: Capability,
    ) => {
      const provided = services.get(capability.id);
      if (provided?.version !== capability.version) {
        throw new Error(
          `Capability ${capability.id}@${capability.version} is not installed.`,
        );
      }
      return readCapabilityService(capability, provided.service);
    },
    manifest: () =>
      Object.freeze(
        order.map((plugin) =>
          Object.freeze({
            name: plugin.name,
            provides: plugin.provides.map(capabilityManifestEntry),
            requires: plugin.requires.map(capabilityManifestEntry),
          }),
        ),
      ),
  });
}

function capabilityManifestEntry(capability: AnyCapability) {
  return Object.freeze({ id: capability.id, version: capability.version });
}
