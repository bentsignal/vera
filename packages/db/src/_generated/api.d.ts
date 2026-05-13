/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent_deltas_helpers from "../agent/deltas/helpers.js";
import type * as agent_deltas_index from "../agent/deltas/index.js";
import type * as agent_deltas_part_handlers from "../agent/deltas/part_handlers.js";
import type * as agent_deltas_provider_metadata from "../agent/deltas/provider_metadata.js";
import type * as agent_deltas_tool_handlers from "../agent/deltas/tool_handlers.js";
import type * as agent_deltas_tool_part_builder from "../agent/deltas/tool_part_builder.js";
import type * as agent_deltas_update_text_stream from "../agent/deltas/update_text_stream.js";
import type * as agent_handlers_add_messages from "../agent/handlers/add_messages.js";
import type * as agent_handlers_messages from "../agent/handlers/messages.js";
import type * as agent_handlers_streams from "../agent/handlers/streams.js";
import type * as agent_mapping_approvals from "../agent/mapping/approvals.js";
import type * as agent_mapping_content from "../agent/mapping/content.js";
import type * as agent_mapping_data from "../agent/mapping/data.js";
import type * as agent_mapping_index from "../agent/mapping/index.js";
import type * as agent_mapping_messages from "../agent/mapping/messages.js";
import type * as agent_mapping_results from "../agent/mapping/results.js";
import type * as agent_mapping_tool_results from "../agent/mapping/tool_results.js";
import type * as agent_mapping_types from "../agent/mapping/types.js";
import type * as agent_mapping_usage from "../agent/mapping/usage.js";
import type * as agent_messages from "../agent/messages.js";
import type * as agent_shared from "../agent/shared.js";
import type * as agent_streams from "../agent/streams.js";
import type * as agent_threads from "../agent/threads.js";
import type * as agent_tools_create_tool from "../agent/tools/create_tool.js";
import type * as agent_tools_index from "../agent/tools/index.js";
import type * as agent_tools_types from "../agent/tools/types.js";
import type * as agent_tools_wrap_tools from "../agent/tools/wrap_tools.js";
import type * as agent_ui_assistant_approvals from "../agent/ui/assistant/approvals.js";
import type * as agent_ui_assistant_create_assistant_ui_message from "../agent/ui/assistant/create_assistant_ui_message.js";
import type * as agent_ui_assistant_handle_approval from "../agent/ui/assistant/handle_approval.js";
import type * as agent_ui_assistant_handle_tool_call from "../agent/ui/assistant/handle_tool_call.js";
import type * as agent_ui_assistant_handle_tool_result from "../agent/ui/assistant/handle_tool_result.js";
import type * as agent_ui_assistant_process_content_part from "../agent/ui/assistant/process_content_part.js";
import type * as agent_ui_assistant_tool_part_helpers from "../agent/ui/assistant/tool_part_helpers.js";
import type * as agent_ui_combine_ui_messages from "../agent/ui/combine_ui_messages.js";
import type * as agent_ui_from_ui_messages from "../agent/ui/from_ui_messages.js";
import type * as agent_ui_group_assistant_messages from "../agent/ui/group_assistant_messages.js";
import type * as agent_ui_index from "../agent/ui/index.js";
import type * as agent_ui_sources from "../agent/ui/sources.js";
import type * as agent_ui_system from "../agent/ui/system.js";
import type * as agent_ui_to_ui_messages from "../agent/ui/to_ui_messages.js";
import type * as agent_ui_types from "../agent/ui/types.js";
import type * as agent_ui_user from "../agent/ui/user.js";
import type * as agent_validators_content from "../agent/validators/content.js";
import type * as agent_validators_doc from "../agent/validators/doc.js";
import type * as agent_validators_index from "../agent/validators/index.js";
import type * as agent_validators_message from "../agent/validators/message.js";
import type * as agent_validators_options from "../agent/validators/options.js";
import type * as agent_validators_shared from "../agent/validators/shared.js";
import type * as agent_validators_stream from "../agent/validators/stream.js";
import type * as agent_validators_system from "../agent/validators/system.js";
import type * as agent_validators_tool from "../agent/validators/tool.js";
import type * as ai_agents from "../ai/agents.js";
import type * as ai_models_embed from "../ai/models/embed.js";
import type * as ai_models_helpers from "../ai/models/helpers.js";
import type * as ai_models_image from "../ai/models/image.js";
import type * as ai_models_language from "../ai/models/language.js";
import type * as ai_models_presets from "../ai/models/presets.js";
import type * as ai_models_types from "../ai/models/types.js";
import type * as ai_models_voice from "../ai/models/voice.js";
import type * as ai_prompts from "../ai/prompts.js";
import type * as ai_stream_abort_watcher from "../ai/stream/abort_watcher.js";
import type * as ai_stream_error_codes from "../ai/stream/error_codes.js";
import type * as ai_stream_errors from "../ai/stream/errors.js";
import type * as ai_stream_layer from "../ai/stream/layer.js";
import type * as ai_stream_notice_codes from "../ai/stream/notice_codes.js";
import type * as ai_stream_program from "../ai/stream/program.js";
import type * as ai_stream_services_agent_runtime from "../ai/stream/services/agent_runtime.js";
import type * as ai_stream_services_follow_ups from "../ai/stream/services/follow_ups.js";
import type * as ai_stream_services_thread_events from "../ai/stream/services/thread_events.js";
import type * as ai_stream_services_thread_state from "../ai/stream/services/thread_state.js";
import type * as ai_stream_stream_event from "../ai/stream/stream_event.js";
import type * as ai_suggestions from "../ai/suggestions.js";
import type * as ai_thread_events from "../ai/thread/events.js";
import type * as ai_thread_followUps from "../ai/thread/followUps.js";
import type * as ai_thread_generation from "../ai/thread/generation.js";
import type * as ai_thread_helpers from "../ai/thread/helpers.js";
import type * as ai_thread_lifecycle from "../ai/thread/lifecycle.js";
import type * as ai_thread_list from "../ai/thread/list.js";
import type * as ai_thread_messages from "../ai/thread/messages.js";
import type * as ai_thread_pinned from "../ai/thread/pinned.js";
import type * as ai_thread_shared from "../ai/thread/shared.js";
import type * as ai_thread_state from "../ai/thread/state.js";
import type * as ai_thread_title from "../ai/thread/title.js";
import type * as ai_tools_code_generation from "../ai/tools/code_generation.js";
import type * as ai_tools_date_time from "../ai/tools/date_time.js";
import type * as ai_tools_files_actions from "../ai/tools/files/actions.js";
import type * as ai_tools_files_index from "../ai/tools/files/index.js";
import type * as ai_tools_image_actions from "../ai/tools/image/actions.js";
import type * as ai_tools_image_helpers from "../ai/tools/image/helpers.js";
import type * as ai_tools_image_index from "../ai/tools/image/index.js";
import type * as ai_tools_image_types from "../ai/tools/image/types.js";
import type * as ai_tools_index from "../ai/tools/index.js";
import type * as ai_tools_search_current_events from "../ai/tools/search/current_events.js";
import type * as ai_tools_search_index from "../ai/tools/search/index.js";
import type * as ai_tools_search_postition_holder from "../ai/tools/search/postition_holder.js";
import type * as ai_tools_search_schemas from "../ai/tools/search/schemas.js";
import type * as ai_tools_tool_helpers from "../ai/tools/tool_helpers.js";
import type * as ai_tools_weather from "../ai/tools/weather.js";
import type * as app_actions from "../app/actions.js";
import type * as app_file_helpers from "../app/file_helpers.js";
import type * as app_library from "../app/library.js";
import type * as app_storage from "../app/storage.js";
import type * as billing_actions from "../billing/actions.js";
import type * as billing_client from "../billing/client.js";
import type * as billing_mutations from "../billing/mutations.js";
import type * as billing_plans from "../billing/plans.js";
import type * as billing_queries from "../billing/queries.js";
import type * as billing_routes from "../billing/routes.js";
import type * as billing_sync from "../billing/sync.js";
import type * as billing_webhook from "../billing/webhook.js";
import type * as convex_helpers from "../convex_helpers.js";
import type * as counter from "../counter.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_date_time_utils from "../lib/date_time_utils.js";
import type * as lib_utils from "../lib/utils.js";
import type * as limiter from "../limiter.js";
import type * as mail_actions from "../mail/actions.js";
import type * as mail_newsletter from "../mail/newsletter.js";
import type * as mail_templates from "../mail/templates.js";
import type * as migrations from "../migrations.js";
import type * as resend from "../resend.js";
import type * as types_library from "../types/library.js";
import type * as uploadthing from "../uploadthing.js";
import type * as user_account from "../user/account.js";
import type * as user_clerk from "../user/clerk.js";
import type * as user_info from "../user/info.js";
import type * as user_subscription from "../user/subscription.js";
import type * as user_usage from "../user/usage.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "agent/deltas/helpers": typeof agent_deltas_helpers;
  "agent/deltas/index": typeof agent_deltas_index;
  "agent/deltas/part_handlers": typeof agent_deltas_part_handlers;
  "agent/deltas/provider_metadata": typeof agent_deltas_provider_metadata;
  "agent/deltas/tool_handlers": typeof agent_deltas_tool_handlers;
  "agent/deltas/tool_part_builder": typeof agent_deltas_tool_part_builder;
  "agent/deltas/update_text_stream": typeof agent_deltas_update_text_stream;
  "agent/handlers/add_messages": typeof agent_handlers_add_messages;
  "agent/handlers/messages": typeof agent_handlers_messages;
  "agent/handlers/streams": typeof agent_handlers_streams;
  "agent/mapping/approvals": typeof agent_mapping_approvals;
  "agent/mapping/content": typeof agent_mapping_content;
  "agent/mapping/data": typeof agent_mapping_data;
  "agent/mapping/index": typeof agent_mapping_index;
  "agent/mapping/messages": typeof agent_mapping_messages;
  "agent/mapping/results": typeof agent_mapping_results;
  "agent/mapping/tool_results": typeof agent_mapping_tool_results;
  "agent/mapping/types": typeof agent_mapping_types;
  "agent/mapping/usage": typeof agent_mapping_usage;
  "agent/messages": typeof agent_messages;
  "agent/shared": typeof agent_shared;
  "agent/streams": typeof agent_streams;
  "agent/threads": typeof agent_threads;
  "agent/tools/create_tool": typeof agent_tools_create_tool;
  "agent/tools/index": typeof agent_tools_index;
  "agent/tools/types": typeof agent_tools_types;
  "agent/tools/wrap_tools": typeof agent_tools_wrap_tools;
  "agent/ui/assistant/approvals": typeof agent_ui_assistant_approvals;
  "agent/ui/assistant/create_assistant_ui_message": typeof agent_ui_assistant_create_assistant_ui_message;
  "agent/ui/assistant/handle_approval": typeof agent_ui_assistant_handle_approval;
  "agent/ui/assistant/handle_tool_call": typeof agent_ui_assistant_handle_tool_call;
  "agent/ui/assistant/handle_tool_result": typeof agent_ui_assistant_handle_tool_result;
  "agent/ui/assistant/process_content_part": typeof agent_ui_assistant_process_content_part;
  "agent/ui/assistant/tool_part_helpers": typeof agent_ui_assistant_tool_part_helpers;
  "agent/ui/combine_ui_messages": typeof agent_ui_combine_ui_messages;
  "agent/ui/from_ui_messages": typeof agent_ui_from_ui_messages;
  "agent/ui/group_assistant_messages": typeof agent_ui_group_assistant_messages;
  "agent/ui/index": typeof agent_ui_index;
  "agent/ui/sources": typeof agent_ui_sources;
  "agent/ui/system": typeof agent_ui_system;
  "agent/ui/to_ui_messages": typeof agent_ui_to_ui_messages;
  "agent/ui/types": typeof agent_ui_types;
  "agent/ui/user": typeof agent_ui_user;
  "agent/validators/content": typeof agent_validators_content;
  "agent/validators/doc": typeof agent_validators_doc;
  "agent/validators/index": typeof agent_validators_index;
  "agent/validators/message": typeof agent_validators_message;
  "agent/validators/options": typeof agent_validators_options;
  "agent/validators/shared": typeof agent_validators_shared;
  "agent/validators/stream": typeof agent_validators_stream;
  "agent/validators/system": typeof agent_validators_system;
  "agent/validators/tool": typeof agent_validators_tool;
  "ai/agents": typeof ai_agents;
  "ai/models/embed": typeof ai_models_embed;
  "ai/models/helpers": typeof ai_models_helpers;
  "ai/models/image": typeof ai_models_image;
  "ai/models/language": typeof ai_models_language;
  "ai/models/presets": typeof ai_models_presets;
  "ai/models/types": typeof ai_models_types;
  "ai/models/voice": typeof ai_models_voice;
  "ai/prompts": typeof ai_prompts;
  "ai/stream/abort_watcher": typeof ai_stream_abort_watcher;
  "ai/stream/error_codes": typeof ai_stream_error_codes;
  "ai/stream/errors": typeof ai_stream_errors;
  "ai/stream/layer": typeof ai_stream_layer;
  "ai/stream/notice_codes": typeof ai_stream_notice_codes;
  "ai/stream/program": typeof ai_stream_program;
  "ai/stream/services/agent_runtime": typeof ai_stream_services_agent_runtime;
  "ai/stream/services/follow_ups": typeof ai_stream_services_follow_ups;
  "ai/stream/services/thread_events": typeof ai_stream_services_thread_events;
  "ai/stream/services/thread_state": typeof ai_stream_services_thread_state;
  "ai/stream/stream_event": typeof ai_stream_stream_event;
  "ai/suggestions": typeof ai_suggestions;
  "ai/thread/events": typeof ai_thread_events;
  "ai/thread/followUps": typeof ai_thread_followUps;
  "ai/thread/generation": typeof ai_thread_generation;
  "ai/thread/helpers": typeof ai_thread_helpers;
  "ai/thread/lifecycle": typeof ai_thread_lifecycle;
  "ai/thread/list": typeof ai_thread_list;
  "ai/thread/messages": typeof ai_thread_messages;
  "ai/thread/pinned": typeof ai_thread_pinned;
  "ai/thread/shared": typeof ai_thread_shared;
  "ai/thread/state": typeof ai_thread_state;
  "ai/thread/title": typeof ai_thread_title;
  "ai/tools/code_generation": typeof ai_tools_code_generation;
  "ai/tools/date_time": typeof ai_tools_date_time;
  "ai/tools/files/actions": typeof ai_tools_files_actions;
  "ai/tools/files/index": typeof ai_tools_files_index;
  "ai/tools/image/actions": typeof ai_tools_image_actions;
  "ai/tools/image/helpers": typeof ai_tools_image_helpers;
  "ai/tools/image/index": typeof ai_tools_image_index;
  "ai/tools/image/types": typeof ai_tools_image_types;
  "ai/tools/index": typeof ai_tools_index;
  "ai/tools/search/current_events": typeof ai_tools_search_current_events;
  "ai/tools/search/index": typeof ai_tools_search_index;
  "ai/tools/search/postition_holder": typeof ai_tools_search_postition_holder;
  "ai/tools/search/schemas": typeof ai_tools_search_schemas;
  "ai/tools/tool_helpers": typeof ai_tools_tool_helpers;
  "ai/tools/weather": typeof ai_tools_weather;
  "app/actions": typeof app_actions;
  "app/file_helpers": typeof app_file_helpers;
  "app/library": typeof app_library;
  "app/storage": typeof app_storage;
  "billing/actions": typeof billing_actions;
  "billing/client": typeof billing_client;
  "billing/mutations": typeof billing_mutations;
  "billing/plans": typeof billing_plans;
  "billing/queries": typeof billing_queries;
  "billing/routes": typeof billing_routes;
  "billing/sync": typeof billing_sync;
  "billing/webhook": typeof billing_webhook;
  convex_helpers: typeof convex_helpers;
  counter: typeof counter;
  crons: typeof crons;
  http: typeof http;
  "lib/date_time_utils": typeof lib_date_time_utils;
  "lib/utils": typeof lib_utils;
  limiter: typeof limiter;
  "mail/actions": typeof mail_actions;
  "mail/newsletter": typeof mail_newsletter;
  "mail/templates": typeof mail_templates;
  migrations: typeof migrations;
  resend: typeof resend;
  "types/library": typeof types_library;
  uploadthing: typeof uploadthing;
  "user/account": typeof user_account;
  "user/clerk": typeof user_clerk;
  "user/info": typeof user_info;
  "user/subscription": typeof user_subscription;
  "user/usage": typeof user_usage;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  migrations: import("@convex-dev/migrations/_generated/component.js").ComponentApi<"migrations">;
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
  shardedCounter: import("@convex-dev/sharded-counter/_generated/component.js").ComponentApi<"shardedCounter">;
  resend: import("@convex-dev/resend/_generated/component.js").ComponentApi<"resend">;
  aggregateUsage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateUsage">;
  aggregateStorage: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"aggregateStorage">;
};
