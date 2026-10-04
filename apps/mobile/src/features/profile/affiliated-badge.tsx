import { SymbolIcon } from "~/components/symbol-icon";

const SEAL = { android: "verified", ios: "checkmark.seal.fill" } as const;

/**
 * The check next to the name of an account its PDS vouches for, such as
 * `support@vera.chat`. Tapping it, where it can be tapped, explains it.
 */
export function AffiliatedBadge({ size }: { size: number }) {
  return (
    <SymbolIcon
      name={SEAL}
      size={size}
      tintColorClassName="accent-accent"
      accessibilityLabel="Verified"
    />
  );
}
