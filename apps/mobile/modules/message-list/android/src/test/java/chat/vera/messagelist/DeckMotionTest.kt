package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DeckMotionTest {
  @Test fun leftBringsTheNextAndRightTheOneBefore() {
    assertEquals(1, deckAfterThrow(0, 4, toNext = true))
    assertEquals(3, deckAfterThrow(0, 4, toNext = false))
    assertEquals(0, deckAfterThrow(3, 4, toNext = true))
  }

  @Test fun swipingBackUndoesSwipingOn() {
    // Before: every swipe advanced, whichever way it went.
    for (count in 2..6) {
      for (start in 0 until count) {
        val on = deckAfterThrow(start, count, toNext = true)
        assertEquals(start, deckAfterThrow(on, count, toNext = false))
        val back = deckAfterThrow(start, count, toNext = false)
        assertEquals(start, deckAfterThrow(back, count, toNext = true))
      }
    }
  }

  @Test fun goingAllTheWayRoundComesBack() {
    var current = 2
    repeat(5) { current = deckAfterThrow(current, 5, toNext = true) }
    assertEquals(2, current)
    repeat(5) { current = deckAfterThrow(current, 5, toNext = false) }
    assertEquals(2, current)
  }

  @Test fun thePileShowsTheNextAndTheOneBeforeBehind() {
    assertEquals(DeckSlots(front = 0, next = 1, previous = 2), deckSlots(0, 3))
    assertEquals(DeckSlots(front = 4, next = 0, previous = 3), deckSlots(4, 5))
    // With two photos there is one card behind: next and before are the same.
    val two = deckSlots(1, 2)
    assertEquals(0, two.next)
    assertNull(two.previous)
  }

  @Test fun afterAThrowTheThrownPhotoIsBehindOnItsSide() {
    // Thrown left (on to the next): the old front is now the one before.
    val left = deckSlots(deckAfterThrow(2, 5, toNext = true), 5)
    assertEquals(2, left.previous)
    // Thrown right: it's now the next.
    val right = deckSlots(deckAfterThrow(2, 5, toNext = false), 5)
    assertEquals(2, right.next)
  }

  @Test fun blurClearsInFourStepsAsACardComesForward() {
    assertEquals(0, blurStep(0f))
    assertEquals(DeckSizes.BLUR_STEPS.size - 1, blurStep(1f))
    var last = 0
    var changes = 0
    for (frame in 0..60) {
      val step = blurStep(frame / 60f)
      assertTrue(step >= last)
      if (step != last) changes++
      last = step
    }
    assertEquals(DeckSizes.BLUR_STEPS.size - 1, changes)
    assertEquals(0f, DeckSizes.BLUR_STEPS.last(), 0f)
    assertEquals(0f, DeckSizes.DIM_STEPS.last(), 0f)
  }

  @Test fun theSpringBackStartsWhereLetGoAndSettles() {
    assertEquals(1f, springBack(0f, 0f), 1e-6f)
    assertEquals(0f, springBack(0.5f, 0f), 0.01f)
    // Let go moving back toward rest: it gives a little past, not a wobble.
    val samples = (0..50).map { springBack(it / 100f, -6f) }
    assertTrue(samples.minOrNull()!! > -0.12f)
    assertEquals(0f, samples.last(), 0.02f)
  }

  @Test fun aCardBehindTiltsTowardItsSideAndComesForwardToRest() {
    val right = CardPose.behind(1, density = 2f)
    val left = CardPose.behind(-1, density = 2f)
    assertTrue(right.rotation > 0f && left.rotation < 0f)
    assertTrue(right.x > 0f && left.x < 0f)
    assertTrue(right.y < 0f)
    assertTrue(right.scale < 1f)
    assertEquals(right, right.toward(CardPose.FRONT, 0f))
    assertEquals(CardPose.FRONT, right.toward(CardPose.FRONT, 1f))
  }
}
