"use node";

import { generateText } from "ai";

import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { generateResponse } from "../ai/agents";
import { languageModels } from "../ai/models/language";
import {
  emailSubjectGeneratorPrompt,
  emailSummaryGeneratorPrompt,
  emailTitleGeneratorPrompt,
} from "../ai/prompts";
import { env } from "../convex.env";
import { resend } from "../resend";
import { getNewsletterHtml } from "./templates";

interface Preview {
  prompt: string;
  response: string;
}

// the number of stories to include in the newsletter
const STORY_COUNT = 5;

// the number of stories that will be fed back in to generate the title
// of the newsletter, which will be used in the subject line
const MAX_FOR_SUBJECT = 3;

// mail config
const ORIGIN =
  env.ENVIRONMENT === "development"
    ? "http://localhost:3000"
    : "https://vera.chat";
const ENDPOINT = "mail";
const RESUBSCRIBE = "resubscribe@vera.chat";
const UNSUBSCRIBE = "unsubscribe@vera.chat";
const FROM = "Vera <newsletter@mail.vera.chat>";

async function fetchSuggestions(ctx: ActionCtx) {
  const suggestions = await ctx.runQuery(internal.ai.suggestions.getTopWeekly, {
    numResults: STORY_COUNT,
  });
  return suggestions;
}

async function fetchRecipients(ctx: ActionCtx) {
  const recipients = await ctx.runQuery(internal.mail.newsletter.getRecipients);
  return recipients;
}

async function generatePreviews(
  ctx: ActionCtx,
  suggestions: { prompt: string }[],
) {
  const withFullResponses = await Promise.all(
    suggestions.map(async (suggestion) => ({
      prompt: suggestion.prompt,
      response: await generateResponse(
        ctx,
        suggestion.prompt,
        "Suggestion Response",
      ),
    })),
  );

  return Promise.all(
    withFullResponses.map(async (response) => {
      const { text } = await generateText({
        model: languageModels["gemini-2.0-flash"].model,
        system: emailSummaryGeneratorPrompt,
        prompt: response.response,
      });
      return {
        prompt: response.prompt,
        response: text,
      };
    }),
  );
}

interface SendToRecipientsArgs {
  ctx: ActionCtx;
  recipients: { userId: string; email: string }[];
  previews: Preview[];
  cleanSubject: string;
  cleanTitle: string;
}

async function sendToRecipients({
  ctx,
  recipients,
  previews,
  cleanSubject,
  cleanTitle,
}: SendToRecipientsArgs) {
  await Promise.all(
    recipients.map(async (recipient) => {
      const url = `${ORIGIN}/${ENDPOINT}?userId=${encodeURIComponent(recipient.userId)}`;
      const html = await getNewsletterHtml({
        title: cleanTitle,
        stories: previews,
        userId: recipient.userId,
        origin: ORIGIN,
      });
      await resend.sendEmail(ctx, {
        from: FROM,
        to: recipient.email,
        subject: `📰 ${cleanSubject}`,
        headers: [
          {
            name: "List-Unsubscribe-Post",
            value: "List-Unsubscribe=One-Click",
          },
          {
            name: "List-Unsubscribe",
            value: `<mailto:${UNSUBSCRIBE}>, <${url}&status=false>`,
          },
          {
            name: "List-Resubscribe",
            value: `<mailto:${RESUBSCRIBE}>, <${url}&status=true>`,
          },
        ],
        html,
      });
    }),
  );
}

export const sendNewsletter = internalAction({
  handler: async (ctx) => {
    console.log("Starting newsletter generation");
    const suggestions = await fetchSuggestions(ctx);
    console.log(`Retrieved ${suggestions.length} suggestions`);

    const previews = await generatePreviews(ctx, suggestions);
    console.log(
      `Generated ${previews.length} full responses and previews via agent`,
    );
    const firstPreview = previews.at(0);
    if (!firstPreview) {
      console.log("No previews were generated, aborting");
      return;
    }

    const useForSubject = Math.min(MAX_FOR_SUBJECT, previews.length);
    const topThreeConcat = previews
      .slice(0, useForSubject)
      .map((response, index) => {
        const prompt = (suggestions[index]?.prompt ?? "") + "";
        return `${index + 1}. ${prompt}\n${response.response}`;
      })
      .join("\n");
    const [{ text: subject }, { text: title }] = await Promise.all([
      generateText({
        model: languageModels["gemini-2.0-flash"].model,
        system: emailSubjectGeneratorPrompt,
        prompt: firstPreview.prompt + "\n" + firstPreview.response,
      }),
      generateText({
        model: languageModels["gemini-2.0-flash"].model,
        system: emailTitleGeneratorPrompt,
        prompt: topThreeConcat,
      }),
    ]);

    const cleanSubject = subject.replace(/[\r\n]+/g, " ").trim();
    const cleanTitle = title.replace(/[\r\n]+/g, " ").trim();
    const recipients = await fetchRecipients(ctx);
    console.log(`Sending newsletter to ${recipients.length} recipients`);

    await sendToRecipients({
      ctx,
      recipients,
      previews,
      cleanSubject,
      cleanTitle,
    });
  },
});
