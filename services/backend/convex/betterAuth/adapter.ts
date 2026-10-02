import { passkey } from "@better-auth/passkey";
import { createApi } from "@convex-dev/better-auth";
import { jwt } from "better-auth/plugins/jwt";

import schema from "./schema";

// createApi only reads plugin table definitions from these options; the
// runtime configuration lives in ../auth.ts.
export const {
  create,
  deleteMany,
  deleteOne,
  findMany,
  findOne,
  updateMany,
  updateOne,
} = createApi(schema, () => ({ plugins: [jwt(), passkey()] }));
