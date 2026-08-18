export class PdsInitialResponseTimeoutError extends Error {
  readonly targetUrl: string;

  constructor(targetUrl: string) {
    super(`PDS at ${targetUrl} did not return its initial result in time`);
    this.name = "PdsInitialResponseTimeoutError";
    this.targetUrl = targetUrl;
  }
}
