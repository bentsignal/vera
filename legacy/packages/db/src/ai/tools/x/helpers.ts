import { z } from "zod";

import type { ToolCtx } from "../../../agent/tools";
import { internal } from "../../../_generated/api";
import { env } from "../../../convex.env";

const BASE_URL = "https://api.x.com/2";

const TWEET_FIELDS = [
  "author_id",
  "created_at",
  "public_metrics",
  "conversation_id",
  "lang",
  "entities",
  "referenced_tweets",
].join(",");

const USER_FIELDS = [
  "created_at",
  "description",
  "profile_image_url",
  "public_metrics",
  "location",
  "url",
  "verified",
  "verified_type",
].join(",");

const EXPANSIONS = ["author_id", "referenced_tweets.id"].join(",");

const xUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  username: z.string(),
  created_at: z.string().optional(),
  description: z.string().optional(),
  profile_image_url: z.string().optional(),
  public_metrics: z
    .object({
      followers_count: z.number(),
      following_count: z.number(),
      tweet_count: z.number(),
      listed_count: z.number(),
    })
    .optional(),
  location: z.string().optional(),
  url: z.string().optional(),
  verified: z.boolean().optional(),
  verified_type: z.string().optional(),
});

const xTweetSchema = z.object({
  id: z.string(),
  text: z.string(),
  author_id: z.string().optional(),
  created_at: z.string().optional(),
  public_metrics: z
    .object({
      retweet_count: z.number(),
      reply_count: z.number(),
      like_count: z.number(),
      quote_count: z.number(),
      bookmark_count: z.number().optional(),
      impression_count: z.number().optional(),
    })
    .optional(),
  conversation_id: z.string().optional(),
  lang: z.string().optional(),
  entities: z.unknown().optional(),
  referenced_tweets: z
    .array(
      z.object({
        type: z.enum(["retweeted", "quoted", "replied_to"]),
        id: z.string(),
      }),
    )
    .optional(),
});

const xSearchResponseSchema = z.object({
  data: z.array(xTweetSchema).optional(),
  includes: z
    .object({
      users: z.array(xUserSchema).optional(),
      tweets: z.array(xTweetSchema).optional(),
    })
    .optional(),
  meta: z
    .object({
      newest_id: z.string().optional(),
      oldest_id: z.string().optional(),
      result_count: z.number(),
      next_token: z.string().optional(),
    })
    .optional(),
});

const xUserLookupResponseSchema = z.object({
  data: xUserSchema,
});

const xTweetLookupResponseSchema = z.object({
  data: xTweetSchema,
  includes: z
    .object({
      users: z.array(xUserSchema).optional(),
      tweets: z.array(xTweetSchema).optional(),
    })
    .optional(),
});

const xUserTimelineResponseSchema = z.object({
  data: z.array(xTweetSchema).optional(),
  includes: z
    .object({
      users: z.array(xUserSchema).optional(),
      tweets: z.array(xTweetSchema).optional(),
    })
    .optional(),
  meta: z
    .object({
      newest_id: z.string().optional(),
      oldest_id: z.string().optional(),
      result_count: z.number(),
      next_token: z.string().optional(),
    })
    .optional(),
});

export type XUser = z.infer<typeof xUserSchema>;
export type XTweet = z.infer<typeof xTweetSchema>;

async function xFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.X_BEARER_TOKEN}`,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `X API request failed: ${res.status.toString()} ${res.statusText} — ${body}`,
    );
  }
  return z.unknown().parse(await res.json());
}

export async function searchRecentPosts(query: string, maxResults: number) {
  const params = new URLSearchParams({
    query,
    max_results: maxResults.toString(),
    "tweet.fields": TWEET_FIELDS,
    "user.fields": USER_FIELDS,
    expansions: EXPANSIONS,
  });
  const data = await xFetch(
    `${BASE_URL}/tweets/search/recent?${params.toString()}`,
  );
  return xSearchResponseSchema.parse(data);
}

export async function searchAllPosts(
  query: string,
  maxResults: number,
  startTime?: string,
  endTime?: string,
) {
  const params = new URLSearchParams({
    query,
    max_results: maxResults.toString(),
    "tweet.fields": TWEET_FIELDS,
    "user.fields": USER_FIELDS,
    expansions: EXPANSIONS,
  });
  if (startTime) params.set("start_time", startTime);
  if (endTime) params.set("end_time", endTime);
  const data = await xFetch(
    `${BASE_URL}/tweets/search/all?${params.toString()}`,
  );
  return xSearchResponseSchema.parse(data);
}

export async function lookupUser(username: string) {
  const params = new URLSearchParams({
    "user.fields": USER_FIELDS,
  });
  const data = await xFetch(
    `${BASE_URL}/users/by/username/${encodeURIComponent(username)}?${params.toString()}`,
  );
  return xUserLookupResponseSchema.parse(data);
}

export async function lookupPost(tweetId: string) {
  const params = new URLSearchParams({
    "tweet.fields": TWEET_FIELDS,
    "user.fields": USER_FIELDS,
    expansions: [EXPANSIONS, "attachments.media_keys"].join(","),
  });
  const data = await xFetch(
    `${BASE_URL}/tweets/${encodeURIComponent(tweetId)}?${params.toString()}`,
  );
  return xTweetLookupResponseSchema.parse(data);
}

export async function getUserTimeline(
  userId: string,
  maxResults: number,
  excludeRetweets: boolean,
  excludeReplies: boolean,
) {
  const params = new URLSearchParams({
    max_results: maxResults.toString(),
    "tweet.fields": TWEET_FIELDS,
    "user.fields": USER_FIELDS,
    expansions: EXPANSIONS,
  });
  const excludes = [
    excludeRetweets && "retweets",
    excludeReplies && "replies",
  ].filter(Boolean);
  if (excludes.length > 0) params.set("exclude", excludes.join(","));
  const data = await xFetch(
    `${BASE_URL}/users/${encodeURIComponent(userId)}/tweets?${params.toString()}`,
  );
  return xUserTimelineResponseSchema.parse(data);
}

function formatTweet(tweet: XTweet, users?: XUser[]) {
  const author = users?.find((u) => u.id === tweet.author_id);
  const metrics = tweet.public_metrics;
  return {
    id: tweet.id,
    text: tweet.text,
    author: author
      ? { name: author.name, username: author.username }
      : { id: tweet.author_id },
    created_at: tweet.created_at,
    metrics: metrics
      ? {
          likes: metrics.like_count,
          retweets: metrics.retweet_count,
          replies: metrics.reply_count,
          quotes: metrics.quote_count,
        }
      : undefined,
    referenced_tweets: tweet.referenced_tweets,
    url: author
      ? `https://x.com/${author.username}/status/${tweet.id}`
      : undefined,
  };
}

export function formatSearchResults(
  response: z.infer<typeof xSearchResponseSchema>,
) {
  if (!response.data || response.data.length === 0) {
    return { posts: [], result_count: 0 };
  }
  const users = response.includes?.users;
  return {
    posts: response.data.map((tweet) => formatTweet(tweet, users)),
    result_count: response.meta?.result_count ?? response.data.length,
    next_token: response.meta?.next_token,
  };
}

export function formatTweetResult(
  response: z.infer<typeof xTweetLookupResponseSchema>,
) {
  const users = response.includes?.users;
  return formatTweet(response.data, users);
}

// Pricing: https://docs.x.com/x-api/getting-started/pricing
// Update these values when X changes their pay-per-use rates.
export const X_API_PRICING = {
  postRead: 0.005,
  userRead: 0.01,
} as const;

export async function logXApiCost(
  ctx: ToolCtx,
  resources: { posts?: number; users?: number },
  userId: string,
) {
  const cost =
    (resources.posts ?? 0) * X_API_PRICING.postRead +
    (resources.users ?? 0) * X_API_PRICING.userRead;
  await ctx.runMutation(internal.user.usage.log, {
    userId,
    type: "tool_call",
    cost,
  });
}
