interface Success<T> {
  data: T;
  error: null;
}

interface Failure {
  data: null;
  error: Error;
}

export type Result<T> = Success<T> | Failure;

export async function tryCatch<T>(promise: Promise<T>) {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (caught: unknown) {
    const error = caught instanceof Error ? caught : new Error(String(caught));
    return { data: null, error };
  }
}
