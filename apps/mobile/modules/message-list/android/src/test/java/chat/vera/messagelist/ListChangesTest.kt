package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ListChangesTest {
  private val maya = Person("maya", "Maya", null, "M")

  private fun message(id: String, arrived: Boolean = true) =
    MessageRow(id, false, maya, false, true, true, true, 0.0, "9:41", listOf(TextBlock(listOf(Span(id, null, null, null)), false, "text")),
      emptyList(), emptyList(), null, false, arrived, id)

  private val typing = TypingRow("typing", false, listOf(maya), "Maya is typing")

  // Rows newest first, as the list has them.
  private val shown = listOf(typing, message("m2", arrived = false), message("m1", arrived = false))

  @Test fun aReplyAboveSomeoneStillTypingRisesIn() {
    // Before: the typing row was the first kept row, so the reply counted
    // as a mid-list insert and only faded, or just appeared.
    val next = listOf(typing, message("m3"), message("m2", arrived = false), message("m1", arrived = false))
    val changes = rowChanges(shown, next, wasAtBottom = true)
    assertEquals(setOf("m3"), changes.rising)
    assertEquals(setOf("m3"), changes.arrivals)
    assertTrue("m3" in changes.shownIn)
    assertEquals(1, changes.bottomArrivals)
    // The typing row stays the newest: the list doesn't jump to the bottom row.
    assertFalse(changes.newestInserted)
  }

  @Test fun theFirstReplyAfterTypingRisesInAsTheIndicatorGoes() {
    val next = listOf(message("m3"), message("m2", arrived = false), message("m1", arrived = false))
    val changes = rowChanges(shown, next, wasAtBottom = true)
    assertEquals(setOf("m3"), changes.rising)
    assertEquals(setOf("m3"), changes.arrivals)
    assertTrue(changes.newestInserted)
    // One in, the typing row out.
    assertEquals(2, changes.changed)
  }

  @Test fun scrolledAwayAnArrivalMovesNothingButStillCountsForTheFirehose() {
    val next = listOf(typing, message("m3"), message("m2", arrived = false), message("m1", arrived = false))
    val changes = rowChanges(shown, next, wasAtBottom = false)
    assertTrue(changes.rising.isEmpty())
    assertTrue(changes.shownIn.isEmpty())
    assertTrue(changes.arrivals.isEmpty())
    assertEquals(1, changes.bottomArrivals)
  }

  @Test fun anOlderPageJustAppears() {
    val next = shown + listOf(message("m0", arrived = false), message("m-1", arrived = false))
    val changes = rowChanges(shown, next, wasAtBottom = true)
    assertTrue(changes.shownIn.isEmpty())
    assertTrue(changes.rising.isEmpty())
    assertEquals(0, changes.bottomArrivals)
    assertFalse(changes.newestInserted)
  }

  @Test fun whosTypingFadesInWithoutRising() {
    val before = listOf(message("m2", arrived = false), message("m1", arrived = false))
    val changes = rowChanges(before, listOf(typing) + before, wasAtBottom = true)
    assertEquals(setOf("typing"), changes.shownIn)
    assertTrue(changes.rising.isEmpty())
    assertEquals(0, changes.bottomArrivals)
  }

  @Test fun aSendsShorterComposerAppliesWithTheMessageSent() {
    val hold = InsetHold()
    val tall = Inset(0f, 120f)
    hold.receive(tall)
    hold.markApplied(hold.take()!!)
    // The update that brings the message sent also makes the composer shorter.
    hold.receive(Inset(0f, 64f))
    val carried = hold.take()
    // The list keeps laying out (and the keyboard moving) with the tall
    // composer until those rows apply, so it never drops first.
    assertEquals(tall, hold.applied)
    assertEquals(Inset(0f, 64f), hold.withRows(carried))
  }

  @Test fun anInsetAloneAppliesAtOnceAndAnOlderCarriedOneIsDropped() {
    val hold = InsetHold()
    hold.receive(Inset(0f, 120f))
    val carried = hold.take()
    // JavaScript's fallback: the shorter composer comes alone before those rows apply.
    hold.receive(Inset(0f, 64f))
    val alone = hold.take()
    assertEquals(Inset(0f, 64f), alone)
    hold.markApplied(alone!!)
    assertNull(hold.withRows(carried))
    assertNull(hold.take())
  }

  @Test fun ofTwoQueuedRowUpdatesOnlyTheNewerInsetApplies() {
    val hold = InsetHold()
    hold.receive(Inset(0f, 120f))
    val first = hold.take()
    hold.receive(Inset(0f, 64f))
    val second = hold.take()
    assertNull(hold.withRows(first))
    assertEquals(Inset(0f, 64f), hold.withRows(second))
    // Rows without an inset change carry none.
    assertNull(hold.withRows(hold.take()))
  }
}
