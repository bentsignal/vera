import { fal } from "@fal-ai/client";
import { DEFAULT_PROXY_ROUTE } from "@fal-ai/server-proxy";

fal.config({ proxyUrl: DEFAULT_PROXY_ROUTE });

export { fal };
