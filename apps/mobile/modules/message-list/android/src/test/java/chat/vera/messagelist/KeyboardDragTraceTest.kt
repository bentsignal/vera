package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class KeyboardDragTraceTest {
  @Test fun disabledTracingDoesNotReadOrWriteDiagnosticState() {
    var reads = 0
    val lines = mutableListOf<String>()
    val trace = KeyboardDragTrace({ false }, lines::add)
    val state = { reads++; "state" }
    trace.down(10, state)
    trace.firstMove(state)
    trace.event("hide:request", state)
    trace.end("UP", state)
    assertEquals(0, reads)
    assertEquals(emptyList<String>(), lines)
  }

  @Test fun optInIsSampledPerGestureAndStopsAtItsTerminalEvent() {
    var enabled = true
    val lines = mutableListOf<String>()
    val trace = KeyboardDragTrace({ enabled }, lines::add)
    trace.down(10) { "gate=true" }
    enabled = false
    trace.firstMove { "dy=1" }
    trace.firstMove { error("Do not log every move") }
    trace.event("MOVE:recognized") { "dy=30" }
    trace.event("hide:request") { "ime=true" }
    trace.end("UP:consumed") { "ime=false" }
    assertFalse(trace.active)
    trace.event("late") { error("Terminal gesture must be inactive") }
    trace.down(20) { error("The next gesture must sample opt-out") }
    assertEquals(listOf(
      "gesture=10 DOWN gate=true",
      "gesture=10 MOVE:first dy=1",
      "gesture=10 MOVE:recognized dy=30",
      "gesture=10 hide:request ime=true",
      "gesture=10 UP:consumed ime=false",
    ), lines)
  }

  @Test fun enablingDuringAnUntracedGestureWaitsUntilTheNextDown() {
    var enabled = false
    val lines = mutableListOf<String>()
    val trace = KeyboardDragTrace({ enabled }, lines::add)
    trace.down(10) { error("Disabled") }
    enabled = true
    trace.firstMove { error("Do not enable midway through a gesture") }
    trace.end("CANCEL") { error("Disabled gesture") }
    trace.down(20) { "gate=false" }
    trace.end("CANCEL:intercept") { "ime=true" }
    assertEquals(listOf("gesture=20 DOWN gate=false", "gesture=20 CANCEL:intercept ime=true"), lines)
  }
}
