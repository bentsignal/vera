import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(async ({ mode }) => {
  const { env } = await import("./src/env");

  const isDevelopment =
    mode === "development" || env.VITE_NODE_ENV === "development";

  return {
    server: {
      port: process.env.PORT ? Number(process.env.PORT) : undefined,
      host: true,
      allowedHosts:
        isDevelopment && env.VITE_DEV_ALLOWED_HOST
          ? [env.VITE_DEV_ALLOWED_HOST]
          : undefined,
    },
    plugins: [
      devtools({}),
      tailwindcss(),
      tsconfigPaths(),
      tanstackStart({
        srcDirectory: "src",
        router: { routesDirectory: "app" },
      }),
      viteReact({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
      nitro({
        vercel: {
          config: {
            version: 3,
          },
        },
      }),
    ],
  };
});
