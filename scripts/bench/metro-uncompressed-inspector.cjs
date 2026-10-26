// Profiling repeatedly attaches and detaches CDP. OkHttp 4.12 can close its
// WebSocket deflater while a writer task still uses it. Declining compression
// on Metro's inspector sockets avoids that race without changing app traffic.
// Loaded only by VERA_METRO_PROFILE=1, before Metro creates its HTTP server.
const { Server } = require("node:http");

const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  if (event === "upgrade" && args[0]?.url?.startsWith("/inspector/")) {
    delete args[0].headers["sec-websocket-extensions"];
  }
  return emit.call(this, event, ...args);
};
