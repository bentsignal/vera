import type { Message } from "@decentralized-convex/messages";
import type { ModelMessage, StepResult, ToolSet } from "ai";
import { isStepCount } from "ai";

import type { ActionCtx } from "./_generated/server";
import type { Prompt } from "./agentReply";
import type { Turn } from "./agentTools";
import { modelOrder } from "../assistant-models";
import {
  teamNote,
  toModelMessages,
  visibleImages,
  visibleImageTypes,
} from "./agentHistory";
import { currentTime, currentTools } from "./agentTools";
import { imageUrls } from "./assistantImages";

// The request for a reply (agent.ts): the assistant's `Prompt` and the
// conversation, laid out for the provider's prompt cache, for each model
// that may answer.

/** How long one model call may take before it's tried again (it's usually 2-5 s). */
const STEP_TIMEOUT = 40_000;
/** Model calls in one reply (each may call several tools). */
const MAX_STEPS = 8;

/** How hard the model thinks before each step: lower is faster and cheaper. */
const REASONING = { reasoningEffort: "low" };

/**
 * The generateText options and each model's messages: the conversation,
 * then what changes from one reply to the next, after it so the prompt
 * cache keeps everything before (agent.ts `Prompt`), last before it
 * answers, where it outweighs what the chat says.
 */
export async function replyRequest(
  ctx: ActionCtx,
  turn: Turn,
  history: readonly Message[],
  { instructions, latest, tools }: Prompt,
  { speakers = false }: { speakers?: boolean } = {},
) {
  const closing: ModelMessage[] = [
    ...(latest === undefined
      ? []
      : [{ content: latest, role: "system" as const }]),
    ...(turn.note === null
      ? []
      : [{ content: teamNote(turn.note), role: "system" as const }]),
    {
      content: `${currentTools(tools)}\n\n${currentTime(turn)}`,
      role: "system" as const,
    },
  ];
  const self = turn.self;
  const shown = await imageUrls(ctx, visibleImages(history, self));
  const models = modelOrder(visibleImageTypes(history, self, shown)).map(
    (model) => ({
      messages: [
        ...toModelMessages(history, self, model, shown, { speakers }),
        ...closing,
      ],
      model,
    }),
  );
  const options = {
    allowSystemInMessages: true,
    instructions,
    providerOptions: {
      convexGateway: {
        ...REASONING,
        session_id: await cacheSession(turn.conversationId),
      },
    },
    stopWhen: [isStepCount(MAX_STEPS), saidItsPiece],
    // Every step calls a tool: it speaks only through send_message (or
    // stays quiet), and models otherwise often answer in plain text.
    toolChoice: "required" as const,
    timeout: { stepMs: STEP_TIMEOUT },
    toolCallConcurrency: 1,
    tools,
  };
  return { models, options };
}

/**
 * Ends the reply after a step that only sent messages (or shared support's
 * privacy notice): the model has said its piece and waits for them. It goes
 * on only after other tools, such as a search, whose results it needs.
 * Without this, models keep talking after their answer, even to themselves.
 */
function saidItsPiece({ steps }: { steps: StepResult<ToolSet>[] }) {
  const calls = steps.at(-1)?.toolCalls ?? [];
  return (
    calls.some(
      (call) =>
        call.toolName === "share_privacy_notice" ||
        call.toolName === "stay_quiet",
    ) ||
    (calls.length > 0 &&
      calls.every((call) => call.toolName === "send_message"))
  );
}

/**
 * The gateway's `session_id` for a conversation, which routes its requests
 * to where its prompt cache is from the first one on; without it, the
 * gateway sticks to one place only after a cache hit (measured 2026-10-26:
 * the first follow-up missed without it). A hash, since the ID holds their
 * address.
 */
function cacheSession(conversationId: string) {
  return sha256(conversationId);
}

/**
 * A hash of what the cache should keep from reply to reply: the
 * instructions and the tools. usage.ts counts how often it changes.
 */
export function cachedPartHash(instructions: string, tools: ToolSet) {
  return sha256(
    JSON.stringify([
      instructions,
      Object.entries(tools).map(([name, tool]) => [name, tool.description]),
    ]),
  );
}

async function sha256(text: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
