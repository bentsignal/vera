import type { HttpActionBuilder, HttpRouter } from "convex/server";

export const FEDERATION_DESCRIPTOR_PATH = "/.well-known/decentralized-convex";

export interface FederationCapability {
  id: string;
  lastChanged: string;
}

export interface FederationAuthDescriptor {
  issuer: string;
  jwksUrl: string;
}

export interface FederationDescriptor {
  accountDomain: string;
  auth?: FederationAuthDescriptor;
  capabilities?: readonly FederationCapability[];
  deploymentUrl: string;
  httpUrl: string;
  lastChanged: string;
  version: string;
}

export interface RegisterFederationRoutesOptions {
  descriptor: FederationDescriptor | (() => FederationDescriptor);
  path?: string;
}

export function registerFederationRoutes(
  router: HttpRouter,
  httpAction: HttpActionBuilder,
  options: RegisterFederationRoutesOptions,
) {
  const path = options.path ?? FEDERATION_DESCRIPTOR_PATH;
  router.route({
    handler: httpAction(() =>
      Promise.resolve(
        federationDescriptorResponse(resolveDescriptor(options.descriptor)),
      ),
    ),
    method: "GET",
    path,
  });
  router.route({
    handler: httpAction(() => Promise.resolve(corsResponse())),
    method: "OPTIONS",
    path,
  });
  return router;
}

export function federationDescriptorResponse(descriptor: FederationDescriptor) {
  return new Response(JSON.stringify(descriptor), {
    headers: {
      ...corsHeaders(),
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function resolveDescriptor(
  descriptor: FederationDescriptor | (() => FederationDescriptor),
) {
  return typeof descriptor === "function" ? descriptor() : descriptor;
}

function corsResponse() {
  return new Response(null, { headers: corsHeaders(), status: 204 });
}

function corsHeaders() {
  return {
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-origin": "*",
    "cache-control": "public, max-age=300",
  };
}
