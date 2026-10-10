/**
 * Stack options for a screen that is one `FieldGroup` form: the form's
 * background runs up under the glass header, so the screen is one color
 * from top to bottom. Android matches the header to the form in
 * `form-screen-options.android.ts`.
 */
export function useFormScreenOptions() {
  return { headerTransparent: true } as const;
}
