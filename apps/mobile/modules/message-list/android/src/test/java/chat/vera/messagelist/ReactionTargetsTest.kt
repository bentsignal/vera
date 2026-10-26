package chat.vera.messagelist

import android.view.View
import android.widget.FrameLayout
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class ReactionTargetsTest {
  private val context = RuntimeEnvironment.getApplication()
  private val units = Units(context)
  private val thumbs = Reaction("part-2|👍", "👍", null, null, 3, true)

  private fun exactly(px: Int) = View.MeasureSpec.makeMeasureSpec(px, View.MeasureSpec.EXACTLY)

  /** A carousel card as `CarouselCard` lays it out: the photo, its chips under it. */
  private fun card(): Triple<FrameLayout, View, ChipsView> {
    val card = FrameLayout(context).apply { clipChildren = false }
    val photo = View(context).apply {
      pressTarget = Target("media", "row", part = "part-2", index = 2)
      holdTarget = HoldTarget("row", "part-2", 2)
    }
    val chips = ChipsView(context, units)
    chips.bind(listOf(thumbs), Theme.DEFAULT, "row", "part-2", animate = false, index = 2)
    card.addView(photo)
    card.addView(chips)
    val width = units.px(250f)
    val height = units.px(CarouselSizes.CARD_HEIGHT)
    val lane = ChipMetrics.height(listOf(thumbs), width, Theme.DEFAULT, units)
    card.measure(exactly(width), exactly(height + lane))
    card.layout(0, 0, width, height + lane)
    photo.layout(0, 0, width, height)
    chips.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.AT_MOST), View.MeasureSpec.UNSPECIFIED)
    chips.layout(0, height, chips.measuredWidth, height + chips.measuredHeight)
    return Triple(card, photo, chips)
  }

  @Test fun aChipsTapAndHoldNameItsReactionAndTheItemItBelongsTo() {
    val chips = ChipsView(context, units)
    chips.bind(listOf(thumbs), Theme.DEFAULT, "row", "part-2", animate = false, index = 2)
    val chip = chips.getChildAt(0) as ChipView
    assertEquals(Target("reaction", "row", part = "part-2", index = 2, reactionKey = "part-2|👍"), chip.pressTarget)
    assertEquals(HoldTarget("row", "part-2", 2, reactionKey = "part-2|👍"), chip.holdTarget)
  }

  @Test fun holdingAnItemsChipHoldsTheReactionNotTheMessage() {
    // Before: a chip had no hold target, so a hold fell through to the
    // block under it and opened the message menu.
    val (card, _, chips) = card()
    val chip = chips.getChildAt(0)
    val x = chips.left + chip.left + chip.width / 2f
    val y = chips.top + chip.top + chip.height / 2f
    // Under its photo, as the React Native carousel's cards have them.
    assertTrue(chips.top >= units.px(CarouselSizes.CARD_HEIGHT))
    val hit = hitTest(card, x, y)
    assertEquals("part-2|👍", hit.hold?.reactionKey)
    assertEquals("part-2", hit.hold?.part)
    assertEquals(2, hit.hold?.index)
    assertEquals("reaction", hit.press?.type)
  }

  @Test fun holdingThePhotoBesideItsChipsHoldsThePhoto() {
    val (card, photo, _) = card()
    val hit = hitTest(card, units.px(200f).toFloat(), units.px(40f).toFloat())
    assertEquals(HoldTarget("row", "part-2", 2), hit.hold)
    assertEquals(photo, hit.holdView)
    assertEquals("media", hit.press?.type)
  }

  @Test fun onlyTheDrawnTapbacksTakeTouchesNotTheRestOfTheirFan() {
    val bubble = View(context).apply {
      pressTarget = Target("message", "row", part = "text")
      holdTarget = HoldTarget("row", "text")
    }
    val taps = TapbacksView(context, units).apply {
      incoming = true
      bind(listOf(Reaction("text|❤️", "❤️", null, null, 1, false)), Theme.DEFAULT, animate = false)
      pressTarget = Target("reaction", "row", part = "text", reactionKey = "text|❤️")
      holdTarget = HoldTarget("row", "text", reactionKey = "text|❤️")
    }
    val row = FrameLayout(context)
    row.addView(bubble)
    row.addView(taps)
    row.measure(exactly(units.px(300f)), exactly(units.px(100f)))
    row.layout(0, 0, units.px(300f), units.px(100f))
    bubble.layout(0, units.px(20f), units.px(200f), units.px(80f))
    taps.measure(View.MeasureSpec.UNSPECIFIED, View.MeasureSpec.UNSPECIFIED)
    // Over the bubble's top right corner, as the cell places them.
    val right = units.px(206f)
    taps.layout(right - taps.measuredWidth, 0, right, taps.measuredHeight)
    // One tapback at the corner: the right end of the fan.
    assertTrue(taps.hasTapbackAt(taps.width - units.pxf(10f), units.pxf(17f)))
    assertFalse(taps.hasTapbackAt(units.pxf(5f), units.pxf(17f)))
    val onTapback = hitTest(row, right - units.pxf(10f), units.pxf(25f))
    assertEquals("text|❤️", onTapback.hold?.reactionKey)
    // Under the empty part of the fan is the bubble.
    val besideIt = hitTest(row, taps.left + units.pxf(5f), units.pxf(25f))
    assertNull(besideIt.hold?.reactionKey)
    assertEquals("message", besideIt.press?.type)
  }
}
