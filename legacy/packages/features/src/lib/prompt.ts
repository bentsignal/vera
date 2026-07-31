/**
 * Validate that a prompt is non-empty after trimming.
 * Returns the trimmed prompt if valid, or `null` if not.
 */
export function validatePrompt(prompt: string) {
  const trimmed = prompt.trim();
  return trimmed.length > 0 ? trimmed : null;
}
