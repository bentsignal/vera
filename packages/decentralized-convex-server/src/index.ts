export { decentralizedConvexPackage } from "../metadata.ts";
export {
  definePdsApp,
  definePdsPluginComponent,
  pdsDescriptorFromApp,
  pdsReleaseFromApp,
  protocolsFromPdsApp,
  protocolCapabilities,
} from "./app.ts";
export type {
  AnyPdsPluginComponent,
  ComponentInstall,
  PdsAuthAdapter,
  PdsAppDefinition,
  PdsAppOptions,
  PdsPluginComponent,
  PdsPluginsOf,
  PdsProtocolsOf,
  PluginProtocolOf,
  PluginProtocolsOf,
} from "./app.ts";
export {
  FEDERATION_DESCRIPTOR_PATH,
  federationDescriptorResponse,
  registerFederationRoutes,
} from "./descriptor.ts";
export type {
  FederationAuthDescriptor,
  FederationCapability,
  FederationDescriptor,
  RegisterFederationRoutesOptions,
} from "./descriptor.ts";
export { defineComponentDispatchers } from "./dispatcher.ts";
export { definePdsRouter } from "./pds-router.ts";
export type {
  DispatcherIdentity,
  OperationHandlerContext,
  OperationHandlers,
  QueryOperationHandlers,
} from "./dispatcher.ts";
export type {
  PdsRouterMutation,
  PdsRouterMutationRequest,
} from "./pds-router.ts";
export { queryResult, routedQueryResult } from "./routed-query.ts";
export type { RoutedQueryResult } from "./routed-query.ts";
