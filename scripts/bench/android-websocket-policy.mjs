// Verify the app's native WebSocket policy on the wire, with the emulator up.
// Run through with-lock.sh. No native probes or backend mutations are needed.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("../../", import.meta.url));
const require = createRequire(import.meta.url);
const expo = createRequire(
  require.resolve("expo/package.json", { paths: [join(root, "apps/mobile")] }),
);
const { WebSocketServer } = expo("ws");
const run = promisify(execFile);
const serial = /^SERIAL=(emulator-\d+)$/m.exec(
  readFileSync(join(root, ".cache/sim/android"), "utf8"),
)?.[1];
assert.ok(serial, "start this worktree's Android emulator first");
const adb = join(
  process.env.ANDROID_HOME ?? join(homedir(), "Library/Android/sdk"),
  "platform-tools/adb",
);
const server = new WebSocketServer({
  host: "127.0.0.1",
  port: 0,
  perMessageDeflate: true,
});
const received = [];
const echoes = [];
const sockets = new Set();
let wireFailure;

server.on("connection", (socket) => {
  sockets.add(socket);
  let first = true;
  let sendingEcho = false;
  socket._socket.on("data", (chunk) => {
    if (!first) return;
    first = false;
    received.push({
      compressed: (chunk[0] & 0x40) !== 0,
      negotiated: socket.extensions,
    });
  });
  const write = socket._socket.write;
  socket._socket.write = function (chunk, ...args) {
    if (sendingEcho) {
      echoes.push({ compressed: (chunk[0] & 0x40) !== 0 });
      sendingEcho = false;
    }
    return write.call(this, chunk, ...args);
  };
  socket.on("message", (message) => {
    if (message.length !== 32_768) {
      wireFailure = new Error(`unexpected payload length ${message.length}`);
      socket.close();
      return;
    }
    sendingEcho = true;
    socket.send("e".repeat(16_384), { compress: true });
  });
  socket.on("error", () => {});
  socket.on("close", () => sockets.delete(socket));
});

await new Promise((resolve, reject) => {
  server.once("listening", resolve);
  server.once("error", reject);
});
const port = server.address().port;
let reversed = false;
try {
  await run(adb, ["-s", serial, "reverse", `tcp:${port}`, `tcp:${port}`]);
  reversed = true;
  const exchange = `(async () => {
    let echoed = 0;
    for (let i = 0; i < 25; i++) {
      await new Promise((resolve, reject) => {
        const socket = new WebSocket("ws://127.0.0.1:${port}");
        const timeout = setTimeout(() => { socket.close(); reject(new Error("WebSocket policy probe timed out")); }, 5000);
        socket.onopen = () => socket.send("p".repeat(32768));
        socket.onmessage = ({ data }) => {
          if (data !== "e".repeat(16384)) { reject(new Error("compressed echo mismatch")); socket.close(); return; }
          echoed++; socket.close();
        };
        socket.onclose = () => { clearTimeout(timeout); resolve(); };
        socket.onerror = () => { clearTimeout(timeout); reject(new Error("WebSocket probe failed")); };
      });
    }
    return echoed;
  })()`;
  // RN's Promise polyfill is not a native Promise to CDP's awaitPromise.
  // Publish completion explicitly while the server's event loop keeps running.
  const expression = `globalThis.veraSocketProbe = undefined; void ${exchange}.then(
    (echoed) => { globalThis.veraSocketProbe = { echoed }; },
    (error) => { globalThis.veraSocketProbe = { error: String(error) }; }
  )`;
  await run(join(root, "scripts/sim.sh"), ["--android", "eval", expression], {
    cwd: root,
    timeout: 180_000,
  });
  let completed;
  const until = Date.now() + 60_000;
  while (Date.now() < until && completed === undefined) {
    const probe = await run(
      join(root, "scripts/sim.sh"),
      ["--android", "eval", "globalThis.veraSocketProbe"],
      { cwd: root },
    );
    if (probe.stdout.trim()) completed = JSON.parse(probe.stdout.trim());
    else await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (wireFailure) throw wireFailure;
  assert.equal(completed?.error, undefined);
  assert.equal(completed?.echoed, 25);
  assert.equal(received.length, 25);
  assert.equal(echoes.length, 25);
  assert.ok(
    received.every(
      (frame) => frame.negotiated === "permessage-deflate" && !frame.compressed,
    ),
  );
  assert.ok(echoes.every((frame) => frame.compressed));
  // Repeated CDP attach/detach exercises the separate Metro workaround.
  for (let i = 0; i < 20; i++) {
    const probe = await run(
      join(root, "scripts/sim.sh"),
      ["--android", "eval", "1 + 1"],
      { cwd: root },
    );
    assert.equal(probe.stdout.trim(), "2");
  }
  const report = {
    exchanges: 25,
    negotiated: "permessage-deflate",
    compressedClientFrames: 0,
    compressedServerEchoes: 25,
    inspectorReconnects: 20,
  };
  writeFileSync(
    join(root, ".cache/android-websocket-policy-runtime.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report));
} finally {
  if (reversed)
    await run(adb, ["-s", serial, "reverse", "--remove", `tcp:${port}`]);
  for (const socket of sockets) socket.terminate();
  await new Promise((resolve) => server.close(resolve));
}
