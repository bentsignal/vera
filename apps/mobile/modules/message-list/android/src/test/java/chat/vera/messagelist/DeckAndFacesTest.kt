package chat.vera.messagelist

import android.graphics.Bitmap
import android.graphics.Canvas
import android.view.View
import com.bumptech.glide.Glide
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

// API 30: the deck's blur (API 31+) stays out of the way.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [30], manifest = Config.NONE)
class DeckAndFacesTest {
  private val context = RuntimeEnvironment.getApplication()
  private val units = Units(context)
  private val images = Images(Glide.with(context))

  private fun people(count: Int) = (1..count).map { Person("p$it", "Person $it", null, "P$it") }

  private fun shownPhotos(faces: FacesView) = (0 until faces.childCount).count { faces.getChildAt(it).visibility == View.VISIBLE }

  private fun typingFaces(count: Int) = FacesView(context, units).apply {
    bind(people(count), Theme.DEFAULT, images, 18f, 4f, 1.5f, 3, overflow = true)
    measure(0, 0)
  }

  @Test fun typingShowsFourPhotosOrThreeAndHowManyMore() {
    // As React Native's typingFaces: four people show four photos, not three and "+1".
    val four = typingFaces(4)
    assertEquals(4, shownPhotos(four))
    assertNull(four.moreLabel)
    val six = typingFaces(6)
    assertEquals(3, shownPhotos(six))
    assertEquals("+3", six.moreLabel)
    // The pill is as tall as a photo with its ring, and adds at least a photo's width.
    assertEquals(units.px(18f + 3f), six.measuredHeight)
    assertTrue(six.measuredWidth >= typingFaces(3).measuredWidth + units.px(18f - 4f))
  }

  @Test fun aReplyLineShowsAtMostThreePhotosAndNoPill() {
    // Before: the typing rule leaked into the reply line, which React Native caps at three.
    val replies = FacesView(context, units).apply {
      bind(people(5), Theme.DEFAULT, images, 18f, 6f, 1f, 3)
      measure(0, 0)
    }
    assertEquals(3, shownPhotos(replies))
    assertNull(replies.moreLabel)
  }

  @Test fun typingPhotosAreRoundAndInitialsAreReactNativesSize() {
    val faces = typingFaces(2)
    for (index in 0 until faces.childCount) {
      val photo = faces.getChildAt(index)
      assertEquals(units.px(18f), photo.measuredWidth)
      assertEquals(photo.measuredWidth, photo.measuredHeight)
    }
    assertEquals(8f, initialsSize(18f), 0f)
    assertEquals(12f, initialsSize(28f), 0f)
    assertEquals(13f, initialsSize(36f), 0f)
  }

  private fun photo(index: Int, width: Int, height: Int) =
    MediaItem("p$index", false, "file:///nonexistent/$index.jpg", null, null, width, height, null, "part-$index", emptyList(), false)

  // 220 wide: a landscape photo is 165 tall, a portrait capped at 280, a square 220.
  private val pile = listOf(photo(0, 1200, 900), photo(1, 900, 1200), photo(2, 1000, 1000))

  private fun deck(front: Int = 0): DeckView {
    val items = pile
    return DeckView(context, units, images, hashMapOf("row#0" to front)).apply {
      bind("row", "row#0", items, Theme.DEFAULT, units.px(300f))
      measure(0, 0)
      layout(0, 0, measuredWidth, measuredHeight)
    }
  }

  @Test fun eachCardIsCenteredInTheTallestPhotosHeight() {
    val deck = deck()
    val tallest = units.px(280f)
    assertEquals(units.px(DeckSizes.PEEK) + tallest + units.px(DeckSizes.DOTS_GAP + DeckSizes.DOTS), deck.measuredHeight)
    val front = deck.frontCard
    assertEquals(units.px(165f), front.height)
    assertEquals(units.px(DeckSizes.PEEK) + (tallest - front.height) / 2, front.top)
    // It turns about its own bottom middle.
    assertEquals(front.height.toFloat(), front.pivotY, 0f)
  }

  @Test fun onlyTurnedCardsGetALayerForTheirEdges() {
    val deck = deck()
    // The front card at rest isn't turned: no offscreen layer for it.
    assertEquals(View.LAYER_TYPE_NONE, deck.frontCard.layerType)
    val behind = (0 until deck.childCount).map { deck.getChildAt(it) }.filter { it !== deck.frontCard }
    assertTrue(behind.all { it.rotation != 0f && it.layerType == View.LAYER_TYPE_HARDWARE })
  }

  @Test fun theFrontCardLiftsAloneAndComesBackToItsPlace() {
    val deck = deck()
    val front = deck.frontCard
    val index = deck.indexOfChild(front)
    val frame = android.graphics.Rect(front.left, front.top, front.right, front.bottom)
    val params = front.layoutParams
    removeForLift(deck, front)
    assertEquals(2, deck.childCount)
    // The pile draws with its front card out (it used to ask for a child it no longer had).
    val canvas = Canvas(Bitmap.createBitmap(deck.width, deck.height, Bitmap.Config.ARGB_8888))
    deck.draw(canvas)
    // Back, as the lift lands.
    deck.addView(front, index, params)
    front.layout(frame.left, frame.top, frame.right, frame.bottom)
    assertSame(deck, front.parent)
    assertSame(front, deck.frontCard)
    assertEquals(frame, android.graphics.Rect(front.left, front.top, front.right, front.bottom))
    deck.draw(canvas)
  }

  @Test fun theFrontPhotosTopIsWhereItsCardIs() {
    // A short photo sits lower in the pile than a tall one; its tapbacks go by this.
    val short = deck(front = 0)
    assertEquals(short.frontCard.top, short.frontTop)
    assertEquals(units.px(DeckSizes.PEEK) + (units.px(280f) - units.px(165f)) / 2, short.frontTop)
    val tall = deck(front = 1)
    assertEquals(tall.frontCard.top, tall.frontTop)
    assertEquals(units.px(DeckSizes.PEEK), tall.frontTop)
    // The pile's height doesn't change with the front photo.
    assertEquals(short.measuredHeight, tall.measuredHeight)
  }

  @Test fun aDecksTapbacksSitOnItsShortFrontPhotosCorner() {
    // Before: placed from the pile's top as if every photo were the tallest,
    // they floated 57 above a landscape photo.
    val maya = Person("maya", "Maya", null, "M")
    val thumbs = Reaction("part-0|👍", "👍", null, null, 1, false)
    val items = pile.mapIndexed { index, item -> if (index == 0) item.copy(reactions = listOf(thumbs)) else item }
    val row = MessageRow("m1", false, maya, false, false, true, true, 0.0, "9:41", listOf(MediaBlock(items, "deck")),
      emptyList(), emptyList(), null, false, false, "")
    val env = CellEnv(units, images, androidx.recyclerview.widget.RecyclerView.RecycledViewPool())
    val cell = MessageCell(context, env, signatureOf(row))
    cell.bind(row, animate = false)
    cell.measure(View.MeasureSpec.makeMeasureSpec(units.px(400f), View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
    cell.layout(0, 0, cell.measuredWidth, cell.measuredHeight)
    val children = (0 until cell.childCount).map { cell.getChildAt(it) }
    val deck = children.filterIsInstance<DeckView>().single()
    val taps = children.filterIsInstance<TapbacksView>().single()
    val photoTop = deck.top + deck.frontCard.top
    // Over the photo's top corner, by the tapbacks' overlap, as on any bubble.
    assertEquals(photoTop - units.px(TapbacksView.SPACE), taps.top)
    assertTrue(taps.bottom > photoTop)
  }
}
