package chat.vera.messagelist

import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], manifest = Config.NONE)
class StackedBodyChipsTest {
  private val context = RuntimeEnvironment.getApplication()
  private val units = Units(context)
  private val body = TextBlock(listOf(Span("Testing", null, null, null)), false, "body")
  private val messageReactions = listOf(Reaction("body|👍", "👍", null, null, 1, false), Reaction("body|👎", "👎", null, null, 1, false))
  private val heart = Reaction("photo-0|❤️", "❤️", null, null, 1, true)
  private fun photos(count: Int) = MediaBlock((0 until count).map {
    MediaItem("photo-$it", false, "file:///nonexistent/$it.jpg", null, null, 960, 540, null, "photo-$it",
      if (it == 0) listOf(heart) else emptyList(), false)
  }, "media-block")

  private fun cell(blocks: List<Block>): MessageCell {
    val row = MessageRow("row", true, Person("author", "Author", null, "A"), false, true, true, true,
      0.0, "10:08", blocks, messageReactions, emptyList(), null, false, false, "Testing")
    val env = CellEnv(units, Images(Glide.with(context)), RecyclerView.RecycledViewPool())
    return MessageCell(context, env, signatureOf(row)).apply {
      bind(row, animate = false)
      measure(View.MeasureSpec.makeMeasureSpec(units.px(400f), View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
      layout(0, 0, measuredWidth, measuredHeight)
    }
  }

  private fun descendants(view: View): List<View> = listOf(view) +
    if (view is ViewGroup) (0 until view.childCount).flatMap { descendants(view.getChildAt(it)) } else emptyList()

  private fun chip(cell: MessageCell, key: String) = descendants(cell).filterIsInstance<ChipView>()
    .first { it.pressTarget?.reactionKey == key }

  private fun assertTarget(cell: MessageCell, chip: ChipView, part: String, index: Int?, key: String) {
    val bounds = Rect()
    chip.getDrawingRect(bounds)
    cell.offsetDescendantRectToMyCoords(chip, bounds)
    val hit = hitTest(cell, bounds.exactCenterX(), bounds.exactCenterY())
    assertEquals(Target("reaction", "row", part = part, index = index, reactionKey = key), hit.press)
    assertEquals(HoldTarget("row", part, index, reactionKey = key), hit.hold)
  }

  @Test fun messageChipsSitImmediatelyUnderBodyBeforeSinglePhotoAndKeepTheirPart() {
    val cell = cell(listOf(body, photos(1)))
    val text = descendants(cell).filterIsInstance<TextView>().first { it.text.toString() == "Testing" }
    val bodyLane = chip(cell, "body|👍").parent as ChipsView
    val photo = descendants(cell).filterIsInstance<MediaView>().single()
    val photoLane = chip(cell, heart.key).parent as ChipsView
    assertEquals(text.bottom, bodyLane.top)
    assertEquals(bodyLane.bottom + units.px(4f), photo.top)
    assertEquals(photo.bottom, photoLane.top)
    assertEquals(cell.height, photoLane.bottom)
    assertTarget(cell, chip(cell, "body|👍"), "body", null, "body|👍")
    assertTarget(cell, chip(cell, "body|👎"), "body", null, "body|👎")
    assertTarget(cell, chip(cell, heart.key), "photo-0", 0, heart.key)
  }

  @Test fun messageChipsAlsoPrecedeCarouselWithoutTakingItsPhotoReactions() {
    val cell = cell(listOf(body, photos(2)))
    val text = descendants(cell).filterIsInstance<TextView>().first { it.text.toString() == "Testing" }
    val bodyLane = chip(cell, "body|👍").parent as ChipsView
    val carousel = descendants(cell).filterIsInstance<CarouselView>().single()
    assertEquals(text.bottom, bodyLane.top)
    assertEquals(bodyLane.bottom + units.px(4f), carousel.top)
    assertTarget(cell, chip(cell, "body|👍"), "body", null, "body|👍")
    assertTarget(cell, chip(cell, heart.key), "photo-0", 0, heart.key)
  }

  @Test fun noTextKeepsTheExistingTrailingMessageLaneAndMediaPartTargets() {
    val cell = cell(listOf(photos(1)))
    val bodyLane = chip(cell, "body|👍").parent as ChipsView
    val photoLane = chip(cell, heart.key).parent as ChipsView
    assertEquals(photoLane.bottom, bodyLane.top)
    assertEquals(cell.height, bodyLane.bottom)
    assertTrue(photoLane.measuredHeight > 0)
    assertTarget(cell, chip(cell, "body|👍"), "media-block", null, "body|👍")
    assertTarget(cell, chip(cell, heart.key), "photo-0", 0, heart.key)
  }
}
