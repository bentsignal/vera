# Android WebSocket policy

The config plugin calls `WebSocketPolicy.install()` in `MainApplication.onCreate`
before `loadReactNative(this)` and Expo's application lifecycle callbacks. An
Expo lifecycle listener would run after React initialization in the SDK 57
template, which is too late to guarantee that the provider has not cached a
client. This applies to both Vera and Vera Dev.

The policy disables **outbound WebSocket message compression** with
`minWebSocketMessageToCompress(Long.MAX_VALUE)`. Inbound compression still works.
It does not alter HTTP compression or change dependency versions.

React Native's public provider API has a factory setter but no factory getter.
Installation calls `createClient()` once to honor any previously registered
factory, then wraps that client's settings with `newBuilder()`. With no existing
factory, `createClient()` uses `createClientBuilder()`, including React's cookie
jar and timeout defaults. Custom cookies, interceptors, connection pool,
dispatcher, and timeouts survive. The previous factory's configuration is
captured once, rather than invoking that factory for later clients. Register any
custom factory before this policy, and do not replace it afterward. Installation
must precede the provider's first `getOkHttpClient()` call.

## Why

On 2026-10-23 the Android dev client crashed twice in
`OkHttp TaskRunner → MessageDeflater → DeflaterSink`, once with `closed` and once
with a buffer bounds error. The resolved dependency was OkHttp 4.12.0. These
stacks fit the known concurrent writer cleanup race, although the crashing
socket's URL was not captured.

In [OkHttp 4.12.0's failure cleanup](https://github.com/square/okhttp/blob/parent-4.12.0/okhttp/src/main/kotlin/okhttp3/internal/ws/RealWebSocket.kt),
the failing thread can close the writer while its queue still compresses a
message. The writer task catches `IOException`; these runtime exceptions escape.
[OkHttp 5.0.0-alpha.12](https://github.com/square/okhttp/blob/parent-5.0.0-alpha.12/okhttp/src/jvmMain/kotlin/okhttp3/internal/ws/RealWebSocket.kt)
moves writer cleanup onto the writer queue. This mitigation avoids the outgoing
deflater without a broad dependency upgrade. The
[compression threshold is a supported API](https://github.com/square/okhttp/blob/parent-4.12.0/okhttp/src/main/kotlin/okhttp3/OkHttpClient.kt).

This is not inherently limited to inspectors. Both RN's inspector and its
production `WebSocketModule` derive clients from `OkHttpClientProvider`. A live,
unauthenticated handshake to the shared dev PDS's `/api/1.46.0/sync` endpoint
negotiated `permessage-deflate`. That demonstrates exposure on app sync, not a
reproduction of this crash on that socket or a test of the production PDS.
Disabling Metro inspector compression separately only protects those inspector
connections.

## Verification

- `pnpm -F @vera/mobile test` checks plugin startup ordering, idempotence, and
  failure on an unrecognized MainApplication template.
- From generated `apps/mobile/android`, run
  `./gradlew :networking:testDebugUnitTest`. These JVM tests exercise the actual
  RN provider, default cookie jar and timeouts, an existing factory's settings,
  the cached provider client, and the threshold on derived clients.
- The combined Android build still needs runtime verification. Confirm the
  provider threshold before JS starts, then exercise app sync, reconnects, and
  repeated inspector attach/detach during scrolling with no fatal logcat events.

This avoids the reported outgoing compression race. It does not claim that all
WebSocket failure paths have been fixed.
