package chat.vera.messagelist

import android.content.Context
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * The list's layout: from the bottom, newest last. With `alignTop` (a
 * thread), rows that don't fill the list sit at the top under its top
 * padding instead, in the same layout pass. The bottom padding still
 * includes the keyboard, so the keyboard opens into the empty space below
 * the rows and moves them only once it would cover them (the React Native
 * list's `useBlankSpace`).
 */
class ListLayoutManager(context: Context) : LinearLayoutManager(context, RecyclerView.VERTICAL, true) {
  var alignTop = false

  internal data class ScrollAnchor(val id: Long, val bottom: Int)

  /** Keep the visible row's screen position while a smooth target changes. */
  internal fun captureScrollAnchor(recycler: RecyclerView): ScrollAnchor? {
    val view = findViewByPosition(findFirstVisibleItemPosition()) ?: return null
    val margin = (view.layoutParams as RecyclerView.LayoutParams).bottomMargin
    return ScrollAnchor(recycler.getChildViewHolder(view).itemId, getDecoratedBottom(view) + margin)
  }

  internal fun restoreScrollAnchor(recycler: RecyclerView, anchor: ScrollAnchor) {
    val adapter = recycler.adapter ?: return
    val position = (0 until adapter.itemCount).firstOrNull { adapter.getItemId(it) == anchor.id } ?: return
    // Reverse layout's offset is measured from its NEW padded bottom.
    scrollToPositionWithOffset(position, recycler.height - recycler.paddingBottom - anchor.bottom)
  }

  /** The empty space above the rows that alignTop lifted them through, or 0. */
  private var lifted = 0

  override fun onLayoutChildren(recycler: RecyclerView.Recycler, state: RecyclerView.State) {
    super.onLayoutChildren(recycler, state)
    lifted = 0
    if (!alignTop) return
    val gap = gapAbove(state)
    if (gap > 0) {
      offsetChildrenVertical(-gap)
      lifted = gap
    }
  }

  /** How far the oldest row is below the top padding, when every row is on screen. */
  private fun gapAbove(state: RecyclerView.State): Int {
    val count = state.itemCount
    if (count == 0 || childCount < count) return 0
    var top = Int.MAX_VALUE
    for (index in 0 until childCount) {
      val child = getChildAt(index) ?: continue
      top = minOf(top, getDecoratedTop(child))
    }
    return maxOf(0, top - paddingTop)
  }

  /** Lifted rows fit the list: there's nothing to scroll. */
  override fun scrollVerticallyBy(dy: Int, recycler: RecyclerView.Recycler, state: RecyclerView.State): Int {
    if (alignTop && lifted > 0) return 0
    return timed({ "scroll $dy" }) { super.scrollVerticallyBy(dy, recycler, state) }
  }

  /**
   * Binds two rows ahead while the list scrolls, not one, in the time a
   * frame leaves over: a fast fling brings big rows (photos, carousels) in
   * quickly.
   */
  override fun collectAdjacentPrefetchPositions(dx: Int, dy: Int, state: RecyclerView.State, registry: LayoutPrefetchRegistry) {
    super.collectAdjacentPrefetchPositions(dx, dy, state, registry)
    if (dy == 0 || childCount == 0) return
    // Reversed: scrolling up (negative dy) brings older rows, higher positions.
    val next = if (dy < 0) findLastVisibleItemPosition() + 2 else findFirstVisibleItemPosition() - 2
    if (next in 0 until state.itemCount) registry.addPosition(next, Math.abs(dy) * 4)
  }

  override fun canScrollVertically(): Boolean = !(alignTop && lifted > 0) && super.canScrollVertically()
}
