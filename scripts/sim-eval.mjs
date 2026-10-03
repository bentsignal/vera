// Evaluates JavaScript in the app running on this worktree's Metro, over
// the debugger (Chrome DevTools Protocol) connection. scripts/sim.sh uses it
// to call the dev-only `globalThis.veraDev` hooks.
//
//   node scripts/sim-eval.mjs <metro-port> "<expression>"
const [port, expression] = process.argv.slice(2);
if (port === undefined || expression === undefined) {
  console.error('usage: node scripts/sim-eval.mjs <metro-port> "<expression>"');
  process.exit(2);
}

const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
  r.json(),
);
const target = targets.find(
  (t) => t.appId === "chat.vera.app" && t.webSocketDebuggerUrl,
);
if (target === undefined) {
  console.error("the app is not connected to Metro; run scripts/sim.sh up");
  process.exit(1);
}

// Metro only accepts debugger connections from its own origin.
const socket = new WebSocket(target.webSocketDebuggerUrl, {
  headers: { Origin: `http://127.0.0.1:${port}` },
});
const timer = setTimeout(() => {
  console.error("timed out waiting for the app");
  process.exit(1);
}, 15_000);
socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: { awaitPromise: true, expression, returnByValue: true },
    }),
  );
});
socket.addEventListener("message", (event) => {
  const message = JSON.parse(String(event.data));
  if (message.id !== 1) return;
  clearTimeout(timer);
  socket.close();
  const { exceptionDetails, result } = message.result ?? {};
  if (exceptionDetails !== undefined) {
    console.error(
      exceptionDetails.exception?.description ?? exceptionDetails.text,
    );
    process.exit(1);
  }
  if (result?.value !== undefined) console.log(JSON.stringify(result.value));
  process.exit(0);
});
