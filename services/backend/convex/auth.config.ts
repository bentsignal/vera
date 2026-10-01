export default {
  providers: [
    {
      applicationID: "convex",
      domain: process.env.CONVEX_SITE_URL ?? "missing-convex-site-url",
    },
  ],
};
