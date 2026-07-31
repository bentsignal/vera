import { generateText } from "ai";
import { z } from "zod";

import { internal } from "../../_generated/api";
import { createTool } from "../../agent/tools";
import { tryCatch } from "../../lib/utils";
import { calculateModelCost } from "../../user/usage";
import { modelPresets } from "../models/presets";
import { codeGenerationPrompt } from "../prompts";

interface CodeGenerationOutput {
  code: string;
  reasoning?: string;
}

export const codeGeneration = createTool({
  description: `
    Used to generate code for difficult problems. Should not be used for
    simple requests that require basic code.
    
    No input is requried, as the tool can see all of the messages in the 
    thread. The tool will return the code generated as well as any other 
    relevant information, you are then responsible for displaying this 
    information to the user.
  `,
  inputSchema: z.object({}),
  execute: async (ctx, args, options): Promise<CodeGenerationOutput> => {
    const messages = options.messages;

    const model = modelPresets.code;

    const result = await tryCatch(
      generateText({
        system: codeGenerationPrompt,
        model: model.model,
        messages: messages,
        temperature: 1,
      }),
    );

    if (result.error) {
      console.error(result.error);
      return {
        code: "Ran into an error generating code. Please try again.",
      };
    }

    const data = result.data;

    // log usage
    if (ctx.userId) {
      const cost = calculateModelCost({
        model,
        usage: data.usage,
        providerMetadata: data.providerMetadata,
      });
      await ctx.runMutation(internal.user.usage.log, {
        userId: ctx.userId,
        type: "tool_call",
        cost,
      });
    }

    return {
      code: data.text,
      reasoning: data.reasoningText,
    };
  },
});
