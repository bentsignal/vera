export const CapabilityTypeId = Symbol("decentralized-convex/capability");

export interface Capability<
  Id extends string,
  Version extends string,
  Service,
> {
  readonly id: Id;
  readonly version: Version;
  readonly [CapabilityTypeId]: (value: unknown) => Service;
}

export type AnyCapability = Capability<string, string, unknown>;

export type CapabilityService<Value extends AnyCapability> = ReturnType<
  Value[typeof CapabilityTypeId]
>;

export type CapabilityKey<Value extends AnyCapability> =
  `${Value["id"]}@${Value["version"]}`;

export function defineCapability<Service>() {
  return <const Id extends string, const Version extends string>({
    id,
    version,
  }: {
    readonly id: Id;
    readonly version: Version;
  }): Capability<Id, Version, Service> =>
    Object.freeze({
      id,
      version,
      // Capability identity and graph validation make this the package's one trusted erasure boundary.
      // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
      [CapabilityTypeId]: (value: unknown) => value as Service,
    });
}

export function readCapabilityService<Capability extends AnyCapability>(
  capability: Capability,
  value: unknown,
): CapabilityService<Capability> {
  // The capability token is the runtime witness for its erased service type.
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
  return capability[CapabilityTypeId](value) as CapabilityService<Capability>;
}
