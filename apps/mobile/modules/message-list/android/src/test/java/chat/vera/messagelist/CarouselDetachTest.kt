package chat.vera.messagelist

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class CarouselDetachTest {
  private class Holder(val card: FrameLayout) : RecyclerView.ViewHolder(card)

  private class Cards : RecyclerView.Adapter<Holder>() {
    override fun getItemCount() = 3
    override fun onCreateViewHolder(parent: ViewGroup, type: Int) =
      Holder(FrameLayout(parent.context).apply {
        layoutParams = RecyclerView.LayoutParams(300, 200)
        addView(View(context), FrameLayout.LayoutParams(300, 200))
      })
    override fun onBindViewHolder(holder: Holder, position: Int) {}
  }

  private fun layout(view: View) {
    view.measure(View.MeasureSpec.makeMeasureSpec(300, View.MeasureSpec.EXACTLY),
      View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY))
    view.layout(0, 0, 300, 200)
  }

  @Test fun transitioningCardsSurviveDetachAndReattachAtTheThirdPhoto() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val root = FrameLayout(activity)
    activity.setContentView(root)
    val carousel = RecyclerView(activity).apply {
      layoutManager = carouselLayoutManager(activity)
      adapter = Cards()
      itemAnimator = null
    }
    root.addView(carousel)
    layout(root)
    carousel.scrollToPosition(2)
    layout(carousel)
    assertEquals(2, (carousel.layoutManager as androidx.recyclerview.widget.LinearLayoutManager).findFirstVisibleItemPosition())
    repeat(3) {
      // Mirrors react-native-screens' recursive startViewTransition calls.
      for (index in 0 until carousel.childCount) carousel.startViewTransition(carousel.getChildAt(index))
      root.startViewTransition(carousel)
      root.removeView(carousel)
      root.endViewTransition(carousel)
      assertNull(carousel.parent)
      root.addView(carousel)
      layout(root)
      assertEquals(2, (carousel.layoutManager as androidx.recyclerview.widget.LinearLayoutManager).findFirstVisibleItemPosition())
    }
    controller.pause().stop().destroy()
  }

  @Test fun aTransitionOwnedMediaTileCanMoveAndItsInnerHolderIsPinned() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val cell = FrameLayout(activity)
    activity.setContentView(cell)
    val carousel = RecyclerView(activity).apply {
      layoutManager = carouselLayoutManager(activity)
      adapter = Cards()
      itemAnimator = null
    }
    cell.addView(carousel)
    layout(cell)
    val card = carousel.getChildAt(0) as FrameLayout
    val media = card.getChildAt(0)
    val holder = carousel.getChildViewHolder(card)
    val nested = nestedLiftHolders(media, cell)
    assertEquals(listOf(holder), nested)
    nested.forEach { it.setIsRecyclable(false) }
    card.startViewTransition(media)
    removeForLift(card, media)
    assertNull(media.parent)
    val overlay = FrameLayout(activity)
    overlay.addView(media)
    assertFalse(holder.isRecyclable)
    overlay.removeView(media)
    card.addView(media)
    nested.forEach { it.setIsRecyclable(true) }
    assertTrue(holder.isRecyclable)
    assertSame(card, media.parent)
    controller.pause().stop().destroy()
  }
}
