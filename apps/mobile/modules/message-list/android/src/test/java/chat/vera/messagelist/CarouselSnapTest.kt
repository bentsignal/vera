package chat.vera.messagelist

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class CarouselSnapTest {
  // Three photos as a phone lays them out: two wide, the last narrow.
  private val geometry = CarouselGeometry(intArrayOf(250, 250, 130), 6)
  private val viewport = 300

  @Test fun theLastCardRestsFullyOnScreenAtTheEnd() {
    assertArrayEquals(intArrayOf(0, 256, 512), geometry.starts)
    assertEquals(642, geometry.contentWidth)
    val rests = geometry.restingOffsets(viewport)
    // The last card's start (512) is past the end, so it rests at the end:
    // its right edge exactly at the viewport's (the right margin).
    assertArrayEquals(intArrayOf(0, 256, 342), rests)
    assertEquals(viewport, geometry.starts[2] + 130 - rests.last())
  }

  @Test fun releasingNearTheEndStaysAtTheEnd() {
    // Before: the old snap pulled the first visible card to the start, which
    // scrolled the rightmost photo back off on release.
    val rests = geometry.restingOffsets(viewport)
    assertEquals(342, nearestRest(rests, 330))
    assertEquals(342, nearestRest(rests, 342))
    assertEquals(256, nearestRest(rests, 270))
  }

  @Test fun aFlingMovesAtLeastOneRestInItsDirection() {
    val rests = geometry.restingOffsets(viewport)
    // A weak flick from a card still moves on.
    assertEquals(256, flingRest(rests, 0, 10, 900))
    assertEquals(342, flingRest(rests, 256, 260, 900))
    // Back toward the start, too.
    assertEquals(256, flingRest(rests, 342, 330, -900))
    assertEquals(0, flingRest(rests, 256, 250, -900))
  }

  @Test fun aHardFlingCrossesCardsToWhereItsMomentumEnds() {
    val rests = geometry.restingOffsets(viewport)
    assertEquals(342, flingRest(rests, 0, 2000, 8000))
    assertEquals(0, flingRest(rests, 342, -2000, -8000))
  }

  @Test fun atAnEndAFlingFurtherStaysThere() {
    val rests = geometry.restingOffsets(viewport)
    assertEquals(342, flingRest(rests, 342, 600, 4000))
    assertEquals(0, flingRest(rests, 0, -600, -4000))
  }

  @Test fun noVelocitySettlesOnTheNearest() {
    val rests = geometry.restingOffsets(viewport)
    assertEquals(256, flingRest(rests, 200, 200, 0))
  }

  @Test fun cardsNarrowerThanTheViewportHaveOneRest() {
    val narrow = CarouselGeometry(intArrayOf(130, 130), 6)
    assertArrayEquals(intArrayOf(0), narrow.restingOffsets(400))
    assertEquals(0, narrow.maxOffset(400))
  }

  @Test fun theOffsetComesFromAnyLaidOutCard() {
    // The second card's left 56 px past the column: the strip is at 200.
    assertEquals(200, geometry.offsetOf(1, 56))
    // The first card scrolled 200 px left of the column.
    assertEquals(200, geometry.offsetOf(0, -200))
  }

  @Test fun aSavedOffsetIsShownFromTheRightCard() {
    assertEquals(0 to 0, geometry.anchorFor(0))
    assertEquals(1 to -44, geometry.anchorFor(300))
    // The end: the second card is the last whose start is at or before it.
    val (position, start) = geometry.anchorFor(342)
    assertEquals(1, position)
    assertEquals(256 - 342, start)
    assertEquals(342, geometry.offsetOf(position, start))
  }

  @Test fun flingVelocityAndDistanceAreInverses() {
    val spline = FlingSpline(density = 2.625f)
    for (velocity in listOf(500f, 1500f, 4000f, 9000f)) {
      val distance = spline.distance(velocity)
      assertTrue(distance > 0f)
      val back = spline.velocity(distance)
      assertTrue("$velocity came back as $back", abs(back - velocity) / velocity < 0.001f)
      assertEquals(-distance, spline.distance(-velocity), 0.01f)
    }
    assertTrue(spline.distance(4000f) > spline.distance(1500f))
    assertEquals(0f, spline.distance(0f), 0f)
    assertEquals(0, spline.velocityPx(0))
  }

  @Test fun theFlingForAGapLandsOnIt() {
    val spline = FlingSpline(density = 2.625f)
    for (needed in listOf(86, 256, 342, 600)) {
      val velocity = spline.velocityPx(needed)
      assertEquals(needed.toFloat(), spline.distance(velocity.toFloat()), needed * 0.01f)
    }
  }
}
