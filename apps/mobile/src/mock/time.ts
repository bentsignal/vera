/** A date relative to app launch, so mock threads always look recent. */
export function ago({
  days = 0,
  hours = 0,
  minutes = 0,
}: {
  days?: number;
  hours?: number;
  minutes?: number;
}) {
  const ms = ((days * 24 + hours) * 60 + minutes) * 60 * 1000;
  return new Date(Date.now() - ms);
}
