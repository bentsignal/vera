import { z } from "zod";

import type { SearchReturnType } from "./schemas";
import { createTool } from "../../../agent/tools";
import { getCurrentDateTime } from "../../../lib/date_time_utils";
import { tryCatch } from "../../../lib/utils";
import { exaSearchAndContents, logSearchCost } from "../tool_helpers";

const NUM_RESULTS = 5;

export const currentEvents = createTool({
  description: `

  This tool is used to get information about current events happening around the 
  world.
  
  It will return an array of source objects that are the results from the search 
  query. The source objects will have the following fields:

  - url: the url of the source
  - content: the page content of the source
  - title: the title of the source
  - favicon: the favicon of the source
  - image: the image of the source

  Use the **content** field of each object in the list to create an informed and 
  helpful response to address the user's question directly.

  It will also return the current date and time, which can be used to determine
  how current the information returned from the sources is.

  `,
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .max(300)
      .describe(
        "A full sentence query describing the current events you want to know about",
      ),
  }),
  execute: async (ctx, args): Promise<SearchReturnType> => {
    const { data: response, error: responseError } = await tryCatch(
      exaSearchAndContents(args.query, {
        numResults: NUM_RESULTS,
        text: {
          maxCharacters: 5000,
        },
        excludeDomains: ["www.youtube.com"],
      }),
    );
    if (responseError) {
      console.error("Error during current events tool call", responseError);
      return null;
    }

    // log usage
    if (ctx.userId) {
      await logSearchCost(ctx, NUM_RESULTS, ctx.userId);
    }

    const sources = response.results.map((result) => ({
      url: result.url,
      content: result.text,
      title: result.title,
      favicon: result.favicon,
      image: result.image,
    }));

    const dateTime = getCurrentDateTime({
      timezone: "America/New_York",
    });

    return {
      sources,
      currentDateTime: {
        timezone: "America/New_York",
        dateTime,
      },
    };
  },
});
