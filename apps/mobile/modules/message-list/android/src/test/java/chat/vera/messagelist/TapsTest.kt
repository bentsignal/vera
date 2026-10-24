package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Tap sequences as the list's touch handler feeds them to `Taps`: down,
 * then release if the touch stayed a tap. Times in ms, places in px.
 */
class TapsTest {
  private val photo = Target("media", "m1", part = "photo-0", index = 0)
  private val text = Target("message", "m2", part = "text")
  private val thumbs = Target("reaction", "m2", part = "text", reactionKey = "text|👍")

  private fun taps() = Taps(windowMs = 200, slop = 8f)

  @Test fun aPhotoOpensOnItsFirstRelease() {
    // Before: it waited 200 ms for a double tap that might come.
    val taps = taps()
    assertFalse(taps.down(0, 100f, 100f, photo))
    assertEquals(TapAction.Press(photo), taps.release(60, 100f, 100f, photo, onMessage = true))
  }

  @Test fun aQuickSecondTapOnAPhotoIsAnotherPressNotItsMenu() {
    // Before: a double tap on a photo held it (the menu). Now each release
    // is a press at once, with no native cooldown: JavaScript's shared guard
    // keeps the viewer from opening twice.
    val taps = taps()
    taps.down(0, 100f, 100f, photo)
    assertEquals(TapAction.Press(photo), taps.release(60, 100f, 100f, photo, onMessage = true))
    assertFalse(taps.down(140, 101f, 101f, photo))
    assertFalse(taps.second)
    assertEquals(TapAction.Press(photo), taps.release(190, 101f, 101f, photo, onMessage = true))
  }

  @Test fun aMessageStillWaitsAndADoubleTapStillHoldsIt() {
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    assertEquals(TapAction.PressLater(text), taps.release(60, 100f, 100f, text, onMessage = true))
    // The second tap ends the waiting press, and its release holds the message.
    assertTrue(taps.down(200, 104f, 102f, text))
    assertTrue(taps.second)
    assertEquals(TapAction.Hold, taps.release(250, 104f, 102f, text, onMessage = true))
  }

  @Test fun aSingleTapOnAMessageGoesOutOnceItsWaitIsOver() {
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    taps.fired()
    // A tap after it is a new one, not the second of a double tap.
    assertFalse(taps.down(270, 100f, 100f, text))
    assertEquals(TapAction.PressLater(text), taps.release(320, 100f, 100f, text, onMessage = true))
  }

  @Test fun aPhotoTappedRightAfterAMessageOpensInsteadOfHoldingIt() {
    // The message's waiting press is dropped (so two things don't open),
    // and the photo isn't taken as the second of a double tap.
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    assertTrue(taps.down(150, 105f, 110f, photo))
    assertFalse(taps.second)
    assertEquals(TapAction.Press(photo), taps.release(200, 105f, 110f, photo, onMessage = true))
  }

  @Test fun aSecondTapThatEndsOnAPhotoOpensItInsteadOfHolding() {
    // Down on the message, released on the photo beside it within the slop
    // (the release is hit-tested where it ends). Before: it held the photo.
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    assertTrue(taps.down(150, 102f, 104f, text))
    assertTrue(taps.second)
    assertEquals(TapAction.Press(photo), taps.release(190, 104f, 110f, photo, onMessage = true))
    // The guard is the release's: a second tap that stays on the message still holds it.
    taps.down(600, 100f, 100f, text)
    taps.release(660, 100f, 100f, text, onMessage = true)
    taps.down(750, 102f, 104f, text)
    assertEquals(TapAction.Hold, taps.release(790, 104f, 106f, text, onMessage = true))
  }

  @Test fun aSecondTapOnAReactionIsAnotherTapOnIt() {
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    assertTrue(taps.down(150, 102f, 102f, thumbs))
    assertEquals(TapAction.Press(thumbs), taps.release(190, 102f, 102f, thumbs, onMessage = true))
  }

  @Test fun aSecondTapTooFarOrTooLateIsANewTap() {
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    assertFalse(taps.down(150, 140f, 100f, text))
    assertFalse(taps.second)
    val late = taps()
    late.down(0, 100f, 100f, text)
    late.release(60, 100f, 100f, text, onMessage = true)
    assertFalse(late.down(300, 100f, 100f, text))
  }

  @Test fun aDoubleTapOffAMessageHoldsNothing() {
    val taps = taps()
    taps.down(0, 100f, 100f, text)
    taps.release(60, 100f, 100f, text, onMessage = true)
    taps.down(150, 100f, 100f, null)
    assertEquals(TapAction.None, taps.release(190, 100f, 100f, null, onMessage = false))
  }
}
