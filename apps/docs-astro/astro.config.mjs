import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";

export default defineConfig({
  vite: {
    server: {
      allowedHosts: true,
    },
  },
  integrations: [
    starlight({
      title: "vera",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/bentsignal/vera",
        },
      ],
      sidebar: [
        { slug: "index" },
        {
          label: "Getting Started",
          items: [
            { slug: "getting-started" },
            { slug: "getting-started/prereqs" },
            { slug: "getting-started/local" },
            { slug: "getting-started/deploy-app" },
            { slug: "getting-started/deploy-backend" },
            { slug: "getting-started/env" },
            { slug: "getting-started/auth" },
            { slug: "getting-started/billing" },
            { slug: "getting-started/fin" },
          ],
        },
      ],
    }),
  ],
});
