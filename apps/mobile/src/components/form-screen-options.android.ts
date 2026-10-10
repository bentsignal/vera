import { useFormBackground } from "./form-background";

/**
 * Android `useFormScreenOptions`: a header in the form's color, without
 * the shadow under it. Compose lists don't scroll under a transparent
 * header. See `form-screen-options.ts`.
 */
export function useFormScreenOptions() {
  const background = useFormBackground();
  return {
    headerShadowVisible: false,
    headerStyle: { backgroundColor: background },
  } as const;
}
