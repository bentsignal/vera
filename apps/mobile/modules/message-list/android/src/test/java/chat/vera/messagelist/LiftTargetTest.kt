package chat.vera.messagelist

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LiftTargetTest {
  private val caption = TextBlock(listOf(Span("Parity carousel", null, null, null)), false, "caption")
  private val photos = MediaBlock((0..2).map { index ->
    MediaItem("photo-$index", false, "https://example.com/$index.jpg", null, null,
      1200, 900, null, "photo-part-$index", emptyList(), false)
  }, "carousel-block")

  @Test fun thirdPhotoWithItsOwnPartSelectsCarouselAfterCaption() {
    val blocks = listOf(caption, photos)
    assertEquals(1, liftBlockSlot(blocks, listOf(0, 1), "photo-part-2"))
    assertEquals(0, liftBlockSlot(blocks, listOf(0, 1), "caption"))
  }

  @Test fun blockIndicesMapToRenderedSlotsWhenEarlierBlocksAreOmitted() {
    val blocks = listOf(UnknownBlock("not rendered here", "other"), caption, photos)
    assertEquals(1, liftBlockSlot(blocks, listOf(1, 2), "photo-part-2"))
  }

  @Test fun unknownExplicitPartDoesNotLiftTheCaptionInstead() {
    assertNull(liftBlockSlot(listOf(caption, photos), listOf(0, 1), "removed-photo"))
    assertEquals(0, liftBlockSlot(listOf(caption, photos), listOf(0, 1), null))
  }
}
