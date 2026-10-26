package chat.vera.messagelist

import android.content.Context
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/**
 * The carousel's layout manager. The strip spans the whole row, with the
 * text column as its left padding and the margin as its right, and draws
 * into both (`clipToPadding = false`). Asking for the paddings as extra
 * layout space keeps a card laid out, and so drawn, until it has left the
 * screen, instead of recycling it as it crosses the column.
 */
internal class CarouselLayoutManager(context: Context) : LinearLayoutManager(context, HORIZONTAL, false) {
  override fun calculateExtraLayoutSpace(state: RecyclerView.State, extraLayoutSpace: IntArray) {
    extraLayoutSpace[0] = paddingLeft
    extraLayoutSpace[1] = paddingRight
  }
}

internal fun carouselLayoutManager(context: Context): LinearLayoutManager =
  CarouselLayoutManager(context).apply {
    // Screen.startTransitionRecursive marks even our cards as transitioning.
    // During screen detach they can still have a parent after removeViewAt;
    // eager recycling here then throws "attached views may not be recycled".
    // Keep the normal detach behavior and retain the carousel's position.
    recycleChildrenOnDetach = false
    initialPrefetchItemCount = 3
  }
