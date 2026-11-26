# Media CDN rules

Vera's media is served from bunny.net pull zones: `vera-media`
(`media.vera.chat`, production) and `vera-media-dev` (dev). The app uploads
straight to bunny Storage, which serves each file with whatever type the
upload said, so these edge rules decide what a browser may do with it:

- Every file: `X-Content-Type-Options: nosniff`, and every file but PDFs
  `Content-Security-Policy: sandbox; default-src 'none'` (no scripts, no
  acting as a Vera page). Chrome won't show a sandboxed PDF, and its
  viewer keeps a PDF's own scripts away from the page.
- Pictures (JPEG, PNG, GIF, WebP, HEIC, HEIF, AVIF), video, audio and PDFs
  show in the browser. Everything else, SVG and HTML included, downloads as
  a file (`Content-Disposition: attachment`).

`rules.mjs` sets them through the bunny CLI's login. Run it again after
changing it; it replaces only the rules it set (descriptions starting
`vera-media:`).

```sh
node infra/media-cdn/rules.mjs vera-media-dev           # show the plan
node infra/media-cdn/rules.mjs vera-media-dev --apply   # set the rules
bunny api POST /pullzone/<id>/purgeCache                # it prints the id
```

Change the production zone (`vera-media`) only as a release step in
`docs/next-release.md`.
