package chat.vera.messagelist

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class PairedPaddingTest {
  private class Holder(view: View) : RecyclerView.ViewHolder(view)

  private class Rows(count: Int = 50) : RecyclerView.Adapter<Holder>() {
    val ids = (0 until count).map { it.toLong() }.toMutableList()
    init { setHasStableIds(true) }
    override fun getItemCount() = ids.size
    override fun getItemId(position: Int) = ids[position]
    override fun onCreateViewHolder(parent: ViewGroup, type: Int) = Holder(View(parent.context).apply {
      layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 129)
    })
    override fun onBindViewHolder(holder: Holder, position: Int) {}
  }

  private fun fixture(count: Int = 50, block: (RecyclerView, ListLayoutManager, Rows) -> Unit) {
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val manager = ListLayoutManager(activity)
    val rows = Rows(count)
    val list = RecyclerView(activity).apply {
      layoutManager = manager
      adapter = rows
      itemAnimator = ListItemAnimator(Units(activity)).apply { animate = false }
      setPadding(0, 0, 0, 1261)
    }
    activity.setContentView(list)
    list.layoutInPlace(1080, 2424)
    try { block(list, manager, rows) } finally { controller.pause().stop().destroy() }
  }

  @Test fun stableNewestRowMovesByThePairedPaddingDeltaOnlyOnce() {
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val manager = ListLayoutManager(activity)
    val rows = Rows()
    val list = RecyclerView(activity).apply {
      layoutManager = manager
      adapter = rows
      // Keep predictive layout enabled, without any FLIP translation.
      itemAnimator = ListItemAnimator(Units(activity)).apply { animate = false }
      setPadding(0, 0, 0, 1261)
    }
    activity.setContentView(list)
    list.layoutInPlace(1080, 2424)
    assertEquals(1163, manager.findViewByPosition(0)!!.bottom)

    // Actual Modal fixture: 160 -> 96 dp at density 2.625, same row IDs,
    // accessibility-label update only. Keyboard remains frozen at 820 px.
    manager.pinLatestForPadding(list, 1093)
    list.setPadding(0, 0, 0, 1093)
    rows.notifyItemChanged(0)
    list.layoutInPlace(1080, 2424)
    assertEquals(1331, manager.findViewByPosition(0)!!.bottom)
    controller.pause().stop().destroy()
  }

  @Test fun removingPredictiveLayoutRemovesTheExtraShiftWithoutAnyLiftOrTranslation() = fixture { list, manager, rows ->
    // Causal control only. Production keeps predictive animations enabled.
    list.itemAnimator = null
    list.setPadding(0, 0, 0, 1093)
    rows.notifyItemChanged(0)
    list.layoutInPlace(1080, 2424)
    assertEquals(1331, manager.findViewByPosition(0)!!.bottom)
    assertEquals(0f, manager.findViewByPosition(0)!!.translationY, 0f)
  }

  @Test fun growthAndShrinkEachKeepLatestAtTheNewBottom() = fixture { list, manager, rows ->
    for (bottom in listOf(1429, 1093, 1261)) {
      assertTrue(manager.pinLatestForPadding(list, bottom))
      list.setPadding(0, 0, 0, bottom)
      rows.notifyItemChanged(0)
      list.layoutInPlace(1080, 2424)
      assertEquals(2424 - bottom, manager.findViewByPosition(0)!!.bottom)
    }
  }

  @Test fun insertedNewestRowUsesTheSamePairedBottom() = fixture { list, manager, rows ->
    assertTrue(manager.pinLatestForPadding(list, 1093))
    list.setPadding(0, 0, 0, 1093)
    rows.ids.add(0, 100)
    rows.notifyItemInserted(0)
    list.layoutInPlace(1080, 2424)
    assertEquals(100L, list.getChildViewHolder(manager.findViewByPosition(0)!!).itemId)
    assertEquals(1331, manager.findViewByPosition(0)!!.bottom)
  }

  @Test fun releaseWithoutARowChangeKeepsLatestAndSamePaddingDoesNotArmAPin() = fixture { list, manager, _ ->
    assertFalse(manager.pinLatestForPadding(list, 1261))
    assertTrue(manager.pinLatestForPadding(list, 1093))
    list.setPadding(0, 0, 0, 1093)
    list.layoutInPlace(1080, 2424)
    assertEquals(1331, manager.findViewByPosition(0)!!.bottom)
  }

  @Test fun readerFortyPixelsAboveLatestIsNotPinnedByTheArrivalNearThreshold() = fixture { list, manager, rows ->
    manager.scrollToPositionWithOffset(0, -40)
    list.layoutInPlace(1080, 2424)
    assertEquals(1203, manager.findViewByPosition(0)!!.bottom)
    assertFalse(manager.pinLatestForPadding(list, 1093))
    list.setPadding(0, 0, 0, 1093)
    rows.notifyItemChanged(0)
    list.layoutInPlace(1080, 2424)
    assertTrue(manager.findViewByPosition(0)!!.bottom > 1331)
  }

  @Test fun activeGenericFollowRetainsItsVisibleAnchorBeforeSmoothRetarget() = fixture { list, manager, rows ->
    manager.scrollToPositionWithOffset(10, 27)
    list.layoutInPlace(1080, 2424)
    val anchor = manager.captureScrollAnchor(list)!!
    assertFalse(manager.pinLatestForPadding(list, 1093))
    list.setPadding(0, 0, 0, 1093)
    rows.ids.add(0, 100)
    rows.notifyItemInserted(0)
    manager.restoreScrollAnchor(list, anchor)
    list.layoutInPlace(1080, 2424)
    assertEquals(anchor.bottom, list.findViewHolderForItemId(anchor.id)!!.itemView.bottom)
    assertTrue(manager.findFirstVisibleItemPosition() > 0)
  }

  @Test fun shortAlignTopThreadRemainsAtItsTop() = fixture(count = 2) { list, manager, rows ->
    manager.alignTop = true
    list.requestLayout()
    list.layoutInPlace(1080, 2424)
    val before = manager.findViewByPosition(0)!!.bottom
    assertEquals(258, before)
    assertFalse(manager.pinLatestForPadding(list, 1093))
    list.setPadding(0, 0, 0, 1093)
    rows.notifyItemChanged(0)
    list.layoutInPlace(1080, 2424)
    assertEquals(before, manager.findViewByPosition(0)!!.bottom)
  }
}
