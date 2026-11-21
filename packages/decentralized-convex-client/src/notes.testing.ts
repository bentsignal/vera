import { decentralizedConvexPackage as corePackage } from "@decentralized-convex/core/metadata";
import {
  defineOperation,
  definePluginProtocol,
} from "@decentralized-convex/plugin";
import { v } from "convex/values";

import { definePdsApi } from "./pds.ts";

// A small plugin for the client's tests: notes, each by an account, which
// every PDS stores for its own accounts and which a conversation gathers
// from every member's PDS.

export const notesProtocol = definePluginProtocol({
  lastChanged: corePackage.lastChanged,
  name: "notes",
  mutations: {
    create: defineOperation({
      args: v.object({ body: v.string() }),
      returns: v.object({ id: v.string() }),
    }),
  },
  queries: {
    list: defineOperation({
      args: v.object({}),
      returns: v.array(v.object({ author: v.string(), body: v.string() })),
      trust: (notes, { owns }) => notes.filter((note) => owns(note.author)),
    }),
    /** A query that doesn't say what another PDS is believed about. */
    unchecked: defineOperation({
      args: v.object({}),
      returns: v.array(v.object({ author: v.string(), body: v.string() })),
    }),
  },
  requires: {},
});

export const notesApi = definePdsApi(notesProtocol);

export const listNotesRequest = notesApi.notes.queries.list({});

/** A note by someone on `domain`. */
export function note(body: string, domain = `${body[0] ?? "a"}.test`) {
  return { author: `someone@${domain}`, body };
}
