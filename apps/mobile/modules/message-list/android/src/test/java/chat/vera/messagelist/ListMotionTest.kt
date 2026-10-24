package chat.vera.messagelist

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.recyclerview.widget.RecyclerView
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], manifest = Config.NONE)
class ListMotionTest {
  private class Holder(view: View) : RecyclerView.ViewHolder(view)

  private class Rows(var ids: MutableList<String>) : RecyclerView.Adapter<Holder>() {
    init {
      setHasStableIds(true)
    }

    override fun getItemId(position: Int) = ids[position].hashCode().toLong()
    override fun getItemCount() = ids.size
    override fun onCreateViewHolder(parent: ViewGroup, type: Int) =
      Holder(View(parent.context).apply { layoutParams = RecyclerView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 100) })
    override fun onBindViewHolder(holder: Holder, position: Int) {
      holder.itemView.tag = ids[position]
    }
  }

  /** Records which rows the list asks to animate in, and whether they were known as new then. */
  private class Recorder(units: Units) : RecyclerView.ItemAnimator() {
    val animator = ListItemAnimator(units)
    val added = mutableListOf<Pair<String, Boolean>>()

    override fun animateDisappearance(holder: RecyclerView.ViewHolder, pre: ItemHolderInfo, post: ItemHolderInfo?) = false.also { dispatchAnimationFinished(holder) }
    override fun animateAppearance(holder: RecyclerView.ViewHolder, pre: ItemHolderInfo?, post: ItemHolderInfo): Boolean {
      val id = holder.itemView.tag as String
      added.add(id to (id in animator.inserted))
      dispatchAnimationFinished(holder)
      return false
    }
    override fun animatePersistence(holder: RecyclerView.ViewHolder, pre: ItemHolderInfo, post: ItemHolderInfo) = false.also { dispatchAnimationFinished(holder) }
    override fun animateChange(old: RecyclerView.ViewHolder, new: RecyclerView.ViewHolder, pre: ItemHolderInfo, post: ItemHolderInfo) = false.also {
      dispatchAnimationFinished(old)
      if (new !== old) dispatchAnimationFinished(new)
    }
    override fun runPendingAnimations() {}
    override fun endAnimation(item: RecyclerView.ViewHolder) {}
    override fun endAnimations() {}
    override fun isRunning() = false
  }

  @Test fun aReplyAboveTheTypingRowAnimatesInTheSamePassThatKnowsItsNew() {
    // Before: with fixed size, RecyclerView deferred the insert to the next
    // frame; by then the list had cleared which rows were new, so the reply
    // above a typing row that stayed at the bottom just appeared.
    val controller = Robolectric.buildActivity(Activity::class.java).setup()
    val activity = controller.get()
    val root = FrameLayout(activity)
    activity.setContentView(root)
    val units = Units(activity)
    val recorder = Recorder(units)
    val rows = Rows(mutableListOf("typing", "m2", "m1"))
    val list = RecyclerView(activity).apply {
      layoutManager = ListLayoutManager(activity)
      adapter = rows
      itemAnimator = recorder
      setHasFixedSize(true)
    }
    root.addView(list)
    list.layoutInPlace(400, 800)
    recorder.added.clear()

    // As `MessageListView.apply` does: say what's new, change, lay out, forget.
    recorder.animator.inserted = setOf("m3")
    rows.ids.add(1, "m3")
    rows.notifyItemInserted(1)
    list.layoutInPlace(400, 800)
    recorder.animator.inserted = emptySet()

    assertEquals(listOf("m3" to true), recorder.added)
    controller.pause().stop().destroy()
  }

  @Test fun aPhotoReactionTakenBackMovesOnlyTheRowsAbove() {
    // A deck in a bubble loses its tapback: the row's top comes down by the
    // tapbacks' room while its bottom (fixed by the rows under it) stays.
    val context = RuntimeEnvironment.getApplication()
    val units = Units(context)
    val row = View(context)
    val holder = Holder(row)
    val pre = RecyclerView.ItemAnimator.ItemHolderInfo().apply { top = 100; bottom = 400 }
    val post = RecyclerView.ItemAnimator.ItemHolderInfo().apply { top = 134; bottom = 400 }

    val keepsBottom = ListItemAnimator(units).apply { growsAtTop = { true } }
    assertFalse(keepsBottom.animateChange(holder, holder, pre, post))
    assertEquals(0f, row.translationY, 0f)

    // Before: anchored at its top, the photo jumped up by the room and slid
    // back down, a second move under the rows above.
    val keepsTop = ListItemAnimator(units).apply { growsAtTop = { false } }
    assertTrue(keepsTop.animateChange(holder, holder, pre, post))
    assertEquals(-34f, row.translationY, 0f)
    keepsTop.endAnimations()
  }

  private val maya = Person("maya", "Maya", null, "M")

  private fun deckMessage(photoReactions: List<Reaction>, footer: List<FooterLine> = emptyList(), stacked: Boolean = false): MessageRow {
    val photos = (0..1).map { MediaItem("p$it", false, "https://example.com/$it.jpg", null, null, 1200, 900, null, "part-$it", if (it == 0) photoReactions else emptyList(), false) }
    return MessageRow("m1", stacked, maya, false, true, true, true, 0.0, "9:41", listOf(MediaBlock(photos, "deck")), emptyList(), footer, null, false, false, "")
  }

  @Test fun aPhotosReactionGrowsItsRowAtTheTop() {
    val thumbs = listOf(Reaction("part-0|👍", "👍", null, null, 1, true))
    // Before: only the message's own reactions counted, so a photo's didn't.
    assertTrue(reactionsGrowAtTop(deckMessage(thumbs), deckMessage(emptyList())))
    assertTrue(reactionsGrowAtTop(deckMessage(emptyList()), deckMessage(thumbs)))
    // A change under the message too (a reply line) opens at the bottom.
    val replies = listOf(FooterLine("replies", "1 reply", emptyList()))
    assertFalse(reactionsGrowAtTop(deckMessage(thumbs), deckMessage(emptyList(), replies)))
    // Stacked chips go under the message.
    assertFalse(reactionsGrowAtTop(deckMessage(thumbs, stacked = true), deckMessage(emptyList(), stacked = true)))
    assertFalse(reactionsGrowAtTop(null, deckMessage(thumbs)))
  }
}
