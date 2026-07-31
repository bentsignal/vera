import { UTApi } from "uploadthing/server";

import { env } from "~/env";

export const utapi = new UTApi({
  token: env.UPLOADTHING_TOKEN,
});
