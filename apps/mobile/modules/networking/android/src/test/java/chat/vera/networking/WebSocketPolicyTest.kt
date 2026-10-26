package chat.vera.networking

import com.facebook.react.modules.network.OkHttpClientProvider
import com.facebook.react.modules.network.ReactCookieJarContainer
import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import org.junit.After
import org.junit.Assert.*
import org.junit.Test

class WebSocketPolicyTest {
  @After fun clearFactory() {
    OkHttpClientProvider.setOkHttpClientFactory(null)
  }

  @Test fun defaultsKeepReactCookiesAndTimeouts() {
    OkHttpClientProvider.setOkHttpClientFactory(null)
    val defaults = OkHttpClientProvider.createClientBuilder().build()
    WebSocketPolicy.install()
    val client = OkHttpClientProvider.createClient()
    assertEquals(Long.MAX_VALUE, client.minWebSocketMessageToCompress)
    assertTrue(client.cookieJar is ReactCookieJarContainer)
    assertEquals(defaults.connectTimeoutMillis, client.connectTimeoutMillis)
    assertEquals(defaults.readTimeoutMillis, client.readTimeoutMillis)
    assertEquals(defaults.writeTimeoutMillis, client.writeTimeoutMillis)
  }

  @Test fun registeredFactoryConfigurationSurvivesAndTheProviderUsesThePolicy() {
    val cookies = ReactCookieJarContainer()
    val interceptor = Interceptor { chain -> chain.proceed(chain.request()) }
    val previous = OkHttpClientProvider.createClientBuilder()
      .cookieJar(cookies)
      .addInterceptor(interceptor)
      .connectTimeout(7, TimeUnit.SECONDS)
      .minWebSocketMessageToCompress(17)
      .build()
    var factoryCalls = 0
    OkHttpClientProvider.setOkHttpClientFactory {
      factoryCalls++
      previous
    }
    WebSocketPolicy.install()
    val client = OkHttpClientProvider.getOkHttpClient()
    assertEquals(1, factoryCalls)
    assertEquals(Long.MAX_VALUE, client.minWebSocketMessageToCompress)
    assertSame(cookies, client.cookieJar)
    assertSame(interceptor, client.interceptors.single())
    assertSame(previous.connectionPool, client.connectionPool)
    assertSame(previous.dispatcher, client.dispatcher)
    assertEquals(7000, client.connectTimeoutMillis)
    assertEquals(Long.MAX_VALUE, client.newBuilder().build().minWebSocketMessageToCompress)
  }
}
