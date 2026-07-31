import { z } from "zod";

import { createTool } from "../../../agent/tools";
import { tryCatch } from "../../../lib/utils";
import { exaGetContents, logContentsCost } from "../tool_helpers";

export const getPageContents = createTool({
  description: `
  Retrieves the text content of a webpage given its URL.

  Use this tool when the user provides a link and wants to know what's on the
  page, or when you need to read the contents of a specific URL to answer a
  question.

  Returns an object with:
  - url: the url that was fetched
  - title: the page title
  - content: the extracted text content of the page
  `,
  inputSchema: z.object({
    url: z
      .string()
      .url()
      .describe("The full URL of the webpage to retrieve contents from"),
  }),
  execute: async (ctx, args) => {
    const { data: response, error: responseError } = await tryCatch(
      exaGetContents(args.url),
    );
    if (responseError) {
      console.error("Error during get page contents tool call", responseError);
      return null;
    }

    if (ctx.userId) {
      await logContentsCost(ctx, 1, ctx.userId);
    }

    const result = response.results[0];
    return {
      url: result.url,
      title: result.title,
      content: result.text,
    };
  },
});
