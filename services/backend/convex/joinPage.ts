import { httpAction } from "./_generated/server";

// Space invite links are `https://vera.chat/join/<code>` (Vera Dev's are
// `/dev/join/<code>`). With the app installed, the phone opens them in it
// directly (see appAssociation.ts). This page is for everywhere else: a
// browser, a computer, or a phone without Vera.

const TESTFLIGHT_URL = "https://testflight.apple.com/join/CqpKDW25";
const CODE_PATTERN = /^\/(?:dev\/)?join\/([A-Za-z0-9]{1,32})\/?$/;

function page(body: string, status = 200) {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Join a space on Vera</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 17px/1.4 -apple-system, system-ui, sans-serif; margin: 0;
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    text-align: center; background: Canvas; color: CanvasText; }
  main { max-width: 340px; padding: 32px; }
  h1 { font-size: 28px; margin: 0 0 8px; }
  p { color: GrayText; margin: 0 0 24px; }
  a.button { display: block; padding: 14px; border-radius: 999px; margin-bottom: 12px;
    background: #007aff; color: #fff; font-weight: 600; text-decoration: none; }
  a.secondary { color: #007aff; text-decoration: none; }
</style>
</head>
<body><main>${body}</main></body>
</html>`,
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
      status,
    },
  );
}

export const joinPage = httpAction((_ctx, request) => {
  const { pathname } = new URL(request.url);
  const code = CODE_PATTERN.exec(pathname)?.[1];
  if (code === undefined) {
    return Promise.resolve(
      page(
        "<h1>Invite Not Found</h1><p>Check the link and try again.</p>",
        404,
      ),
    );
  }
  const dev = pathname.startsWith("/dev/");
  const app = dev ? "Vera Dev" : "Vera";
  const open = `${dev ? "vera-dev" : "vera"}://join/${code}`;
  return Promise.resolve(
    page(
      `<h1>Join a space on Vera</h1>
<p>You've been invited to a space. Open the link in ${app} to see it and join.</p>
<a class="button" href="${open}">Open in ${app}</a>
${dev ? "" : `<a class="secondary" href="${TESTFLIGHT_URL}">Don't have Vera? Get it on TestFlight</a>`}`,
    ),
  );
});
