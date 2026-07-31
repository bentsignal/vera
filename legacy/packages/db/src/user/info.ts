import { ConvexError, v } from "convex/values";

import type { QueryCtx } from "../_generated/server";
import type { Plan } from "./subscription";
import { getPublicLanguageModels } from "../ai/models/helpers";
import { authedMutation, authedQuery } from "../convex_helpers";
import { isModelSelectionAllowed } from "./subscription";

export async function getUserInfoHelper(ctx: QueryCtx, userId: string) {
  const doc = await ctx.db
    .query("personalInfo")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .first();
  return doc;
}

export const get = authedQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("personalInfo")
      .withIndex("by_user_id", (q) => q.eq("userId", ctx.user.subject))
      .first();
    if (!doc) {
      return null;
    }
    const { _id, _creationTime, userId: _userId, ...publicDoc } = doc;
    return publicDoc;
  },
});

function validateStringLength(
  value: string | undefined,
  maxLength: number,
  fieldName: string,
) {
  if (value && value.length > maxLength) {
    throw new ConvexError(
      `${fieldName} must be less than ${maxLength} characters`,
    );
  }
}

function validateModel(model: string | undefined) {
  if (model) {
    const publicModels = getPublicLanguageModels();
    if (!(model in publicModels)) {
      throw new ConvexError("Invalid model");
    }
  }
}

function validateUserInfoInput(args: {
  name?: string;
  location?: string;
  language?: string;
  notes?: string;
  model?: string;
}) {
  validateStringLength(args.name, 100, "Name");
  validateStringLength(args.location, 100, "Location");
  validateStringLength(args.language, 100, "Language");
  validateStringLength(args.notes, 1000, "Notes");
  validateModel(args.model);
}

export const update = authedMutation({
  args: {
    name: v.optional(v.string()),
    location: v.optional(v.string()),
    language: v.optional(v.string()),
    notes: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    validateUserInfoInput(args);

    const existing = await ctx.db
      .query("personalInfo")
      .withIndex("by_user_id", (q) => q.eq("userId", ctx.user.subject))
      .first();

    const data = {
      name: args.name,
      location: args.location,
      language: args.language,
      notes: args.notes,
      model: args.model,
    };

    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("personalInfo", {
        userId: ctx.user.subject,
        ...data,
      });
    }
  },
});

export function getPerferredModelIfAllowed(plan: Plan, modelId?: string) {
  if (!modelId) {
    return undefined;
  }
  if (!isModelSelectionAllowed(plan)) {
    return undefined;
  }
  const publicModels = getPublicLanguageModels();
  const publicModelIds = Object.keys(publicModels);
  if (publicModelIds.includes(modelId)) {
    return modelId;
  }
  return undefined;
}
