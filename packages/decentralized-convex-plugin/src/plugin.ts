import type { AnyCapability, CapabilityService } from "./capability.ts";

export interface PluginContext<Requirements extends readonly AnyCapability[]> {
  readonly get: <Capability extends Requirements[number]>(
    capability: Capability,
  ) => CapabilityService<Capability>;
}

export type CapabilityServices<Capabilities extends readonly AnyCapability[]> =
  {
    readonly [Index in keyof Capabilities]: Capabilities[Index] extends AnyCapability
      ? CapabilityService<Capabilities[Index]>
      : never;
  };

export interface Plugin<
  Name extends string,
  Requirements extends readonly AnyCapability[],
  Provisions extends readonly AnyCapability[],
> {
  readonly name: Name;
  readonly provides: readonly [...Provisions];
  readonly requires: readonly [...Requirements];
  setup(context: PluginContext<Requirements>): CapabilityServices<Provisions>;
}

export type AnyPlugin = Plugin<
  string,
  readonly AnyCapability[],
  readonly AnyCapability[]
>;

export type PluginRequirements<Value extends AnyPlugin> =
  Value extends Plugin<string, infer Requirements, readonly AnyCapability[]>
    ? Requirements[number]
    : never;

export type PluginProvisions<Value extends AnyPlugin> =
  Value extends Plugin<string, readonly AnyCapability[], infer Provisions>
    ? Provisions[number]
    : never;

export function definePlugin<
  const Name extends string,
  const Requirements extends readonly AnyCapability[],
  const Provisions extends readonly AnyCapability[],
>({
  name,
  provides,
  requires,
  setup,
}: {
  readonly name: Name;
  readonly provides: readonly [...Provisions];
  readonly requires: readonly [...Requirements];
  readonly setup: (
    context: PluginContext<Requirements>,
  ) => CapabilityServices<Provisions>;
}): Plugin<Name, Requirements, Provisions> {
  return Object.freeze({
    name,
    provides,
    requires,
    setup,
  });
}
