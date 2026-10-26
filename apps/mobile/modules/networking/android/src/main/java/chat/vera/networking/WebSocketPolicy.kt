package chat.vera.networking

import com.facebook.react.modules.network.OkHttpClientProvider

/** Install before React starts or the provider caches its first networking client. */
object WebSocketPolicy {
  @JvmStatic
  fun install() {
    // createClient() honors a previously registered factory; without one it
    // uses RN's createClientBuilder(), including ReactCookieJarContainer.
    // Snapshot that client's settings before replacing the factory so we do
    // not recurse or discard its interceptors, cookies, pool, or timeouts.
    val previous = OkHttpClientProvider.createClient()
    OkHttpClientProvider.setOkHttpClientFactory {
      previous.newBuilder()
        .minWebSocketMessageToCompress(Long.MAX_VALUE)
        .build()
    }
  }
}
