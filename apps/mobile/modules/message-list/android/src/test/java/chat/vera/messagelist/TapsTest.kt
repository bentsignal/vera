package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TapsTest {
  private val text = Target("message", "m1", part = "body")
  private val photo = Target("media", "m2", part = "photo-2", index = 2)
  private val reaction = Target("reaction", "m2", part = "photo-2", reactionKey = "photo-2|👍")

  @Test fun aMessagePressIsAvailableOnItsFirstRelease() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    assertEquals(text, taps.release(text))
    assertNull(taps.release(text))
    assertFalse(taps.takeHold())
  }

  @Test fun twoQuickTextTapsAreTwoImmediatePressesNeverAMenu() {
    val taps = Taps()
    repeat(2) {
      taps.begin(stoppedScroll = false)
      assertEquals(text, taps.release(text))
      assertFalse(taps.takeHold())
    }
  }

  @Test fun holdingTextConsumesTheReleaseWithoutOpeningItsThread() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    assertTrue(taps.takeHold())
    assertFalse(taps.takeHold())
    assertNull(taps.release(text))
  }

  @Test fun holdingASecondTouchStillHoldsInsteadOfBeingADoubleTap() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    assertEquals(text, taps.release(text))
    taps.begin(stoppedScroll = false)
    assertTrue(taps.takeHold())
    assertNull(taps.release(text))
  }

  @Test fun mediaStillOpensOnEachReleaseWithItsExactPartAndIndex() {
    val taps = Taps()
    repeat(2) {
      taps.begin(stoppedScroll = false)
      assertEquals(photo, taps.release(photo))
    }
    taps.begin(stoppedScroll = false)
    assertTrue(taps.takeHold())
    assertNull(taps.release(photo))
  }

  @Test fun rapidReactionTapsRemainSeparateAndKeepTheirPartKey() {
    val taps = Taps()
    repeat(2) {
      taps.begin(stoppedScroll = false)
      assertEquals(reaction, taps.release(reaction))
    }
  }

  @Test fun movementCancellationCannotPressOrHoldOnRelease() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    taps.cancel()
    assertFalse(taps.takeHold())
    assertNull(taps.release(text))
    taps.begin(stoppedScroll = false)
    assertEquals(text, taps.release(text))
  }

  @Test fun stoppingAListFlingDoesNotOpenAThread() {
    val taps = Taps()
    taps.begin(stoppedScroll = true)
    assertFalse(taps.isTap)
    assertFalse(taps.takeHold())
    assertNull(taps.release(text))
  }

  @Test fun stoppingAMovingCarouselDoesNotOpenItsPhoto() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    taps.cancel()
    assertNull(taps.release(photo))
    taps.begin(stoppedScroll = false)
    assertEquals(photo, taps.release(photo))
  }

  @Test fun releaseUsesTheCurrentHitAndAnEmptyHitNeverBecomesAHold() {
    val taps = Taps()
    taps.begin(stoppedScroll = false)
    assertEquals(photo, taps.release(photo))
    taps.begin(stoppedScroll = false)
    assertNull(taps.release(null))
    assertFalse(taps.takeHold())
  }
}
