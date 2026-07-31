export type AuthState =
  | { isSignedIn: true; userId: string; token: string }
  | { isSignedIn: false };
