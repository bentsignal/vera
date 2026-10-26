package chat.vera.messagelist

import org.junit.Assert.*
import org.junit.Test

class WeakHostsTest {
  private class Host(var attached: Boolean = true)

  @Test fun aPreviouslyCachedHostCannotHideALiveDuplicate() {
    val hosts = WeakHosts<Host>()
    val first = Host()
    val duplicate = Host()
    hosts.add(first)
    assertSame(first, hosts.single { it.attached })
    hosts.add(duplicate)
    assertNull(hosts.single { it.attached })
    hosts.remove(duplicate)
    assertSame(first, hosts.single { it.attached })
  }

  @Test fun registrationIsIdempotentAndDetachInvalidatesTheChoice() {
    val hosts = WeakHosts<Host>()
    val host = Host()
    hosts.add(host)
    hosts.add(host)
    assertSame(host, hosts.single { it.attached })
    host.attached = false
    assertNull(hosts.single { it.attached })
    assertTrue(hosts.empty)
  }

  @Test fun removalDoesNotUnregisterAnotherLiveHost() {
    val hosts = WeakHosts<Host>()
    val first = Host()
    val other = Host()
    hosts.add(first)
    hosts.add(other)
    hosts.remove(first)
    assertSame(other, hosts.single { it.attached })
    hosts.remove(other)
    assertTrue(hosts.empty)
  }
}
