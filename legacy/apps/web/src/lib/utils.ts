import type { ClassValue } from "clsx";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface Success<T> {
  data: T;
  error: null;
}

interface Failure {
  data: null;
  error: unknown;
}

export type Result<T> = Failure | Success<T>;

export async function tryCatch<T>(promise: Promise<T>) {
  try {
    const data = await promise;
    return { data, error: null } satisfies Success<T>;
  } catch (error: unknown) {
    return { data: null, error } satisfies Failure;
  }
}
