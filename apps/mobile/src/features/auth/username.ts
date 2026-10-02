const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_]{1,28}[a-z0-9])?$/;

/** Lowercase letters, digits, and inner underscores; 3 to 30 characters. */
export function isValidUsername(username: string) {
  return username.length >= 3 && USERNAME_PATTERN.test(username);
}

export function normalizeUsername(input: string) {
  return input.trim().toLowerCase();
}
