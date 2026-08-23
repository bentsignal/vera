/**
 * Every official decentralized Convex package and wire request ships on this
 * one release version. Never update a package version independently.
 */
export const DECENTRALIZED_CONVEX_VERSION = "0.1.0" as const;

/** All ecosystem releases that may be referenced by package metadata. */
export const DECENTRALIZED_CONVEX_RELEASES = ["0.1.0"] as const;

export type DecentralizedConvexVersion =
  (typeof DECENTRALIZED_CONVEX_RELEASES)[number];

export interface DecentralizedConvexPackageMetadata<
  Name extends `@decentralized-convex/${string}` =
    `@decentralized-convex/${string}`,
  LastChanged extends DecentralizedConvexVersion = DecentralizedConvexVersion,
> {
  readonly lastChanged: LastChanged;
  readonly name: Name;
  readonly version: typeof DECENTRALIZED_CONVEX_VERSION;
}

/**
 * Defines the standardized metadata owned and exported by one package.
 * The package supplies only its own identity and last meaningful change.
 */
export function defineDecentralizedConvexPackage<
  const Name extends `@decentralized-convex/${string}`,
  const LastChanged extends DecentralizedConvexVersion,
>({
  name,
  lastChanged,
}: Omit<
  DecentralizedConvexPackageMetadata<Name, LastChanged>,
  "version"
>): DecentralizedConvexPackageMetadata<Name, LastChanged> {
  return Object.freeze({
    lastChanged,
    name,
    version: DECENTRALIZED_CONVEX_VERSION,
  });
}
