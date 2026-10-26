package chat.vera.messagelist

import android.os.SystemClock
import android.util.Log

/**
 * Logs main-thread work over `SLOW_MS` (logcat tag `MessageList`), to find
 * what makes a frame slow. `what` is only built when it's logged.
 */
internal inline fun <T> timed(what: () -> String, block: () -> T): T {
  if (!tracing) return block()
  val start = SystemClock.elapsedRealtimeNanos()
  val result = block()
  val ms = (SystemClock.elapsedRealtimeNanos() - start) / 1e6
  if (ms > SLOW_MS) Log.w("MessageList", "slow ${what()}: ${"%.1f".format(ms)} ms")
  return result
}

internal const val SLOW_MS = 8.0

/** Only in debuggable builds (dev clients), never in what ships. */
@Volatile internal var tracing = false
