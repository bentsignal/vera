package chat.vera.messagelist

import android.view.View
import androidx.recyclerview.widget.RecyclerView

// What a rows update means for the list's motion, and the composer inset
// that waits for one. Kept apart from the view so the orderings are tested.

/** How a rows update moves the list (see `MessageListView.apply`). */
class RowChanges(
  /** Rows added or removed, for the big-change rule. */
  val changed: Int,
  /** New rows that animate in where they belong. */
  val shownIn: Set<String>,
  /** Messages that arrived at the bottom while the reader was there. */
  val arrivals: Set<String>,
  /** New rows at the bottom that rise in with the rows above making room. */
  val rising: Set<String>,
  /** The newest row is new: the list moves to it. */
  val newestInserted: Boolean,
  /** Arrived messages at the bottom, for the firehose count. */
  val bottomArrivals: Int,
)

/**
 * Sorts a rows update. New rows under the newest kept message are at the
 * bottom, even when who's typing stays under them (they rise in above it).
 * At the bottom, those rise and fade in; scrolled away, nothing visible
 * moves for them. New rows past the oldest kept row are an older page and
 * just appear. The rest fade in where they belong.
 */
fun rowChanges(before: List<Row>, next: List<Row>, wasAtBottom: Boolean): RowChanges {
  val beforeIds = HashSet<String>(before.size * 2)
  before.forEach { beforeIds.add(it.id) }
  val firstKept = next.indexOfFirst { it.id in beforeIds }.let { if (it < 0) next.size else it }
  val bottomOf = next.indexOfFirst { it.id in beforeIds && it !is TypingRow }.let { if (it < 0) next.size else it }
  val lastKept = next.indexOfLast { it.id in beforeIds }
  var inserted = 0
  var bottomArrivals = 0
  val shownIn = HashSet<String>()
  val arrivals = HashSet<String>()
  val rising = HashSet<String>()
  for ((index, row) in next.withIndex()) {
    if (row.id in beforeIds) continue
    inserted++
    if (index < bottomOf && row is MessageRow && row.arrived) bottomArrivals++
    if (index > lastKept) continue
    if (index < bottomOf) {
      if (!wasAtBottom) continue
      if (row is MessageRow && row.arrived) arrivals.add(row.id)
      if (row !is TypingRow) rising.add(row.id)
    }
    shownIn.add(row.id)
  }
  return RowChanges(
    changed = inserted + (before.size - (next.size - inserted)),
    shownIn = shownIn,
    arrivals = arrivals,
    rising = rising,
    newestInserted = firstKept > 0,
    bottomArrivals = bottomArrivals,
  )
}

/** The list's insets from JavaScript, in points. */
data class Inset(val top: Float, val bottom: Float)

/**
 * The insets JavaScript sends, and when they apply. A send makes the
 * composer shorter in the same props update that brings the message sent
 * (`send-inset.ts`): that inset applies with those rows, in one layout pass,
 * so the composer's shrink and the arrival are one move. An inset that
 * comes alone applies at once. Rows decode off the main thread, so an inset
 * carried with them is dropped if a newer one has come since.
 */
class InsetHold {
  /** The newest JavaScript sent. */
  var latest = Inset(0f, 0f)
    private set

  /** What the list lays out with now; the keyboard moves on top of it. */
  var applied = Inset(0f, 0f)
    private set

  private var pending = false

  fun receive(inset: Inset) {
    latest = inset
    pending = true
  }

  /** At the end of a props update: the inset it changed, if it did (to apply now, or to carry with its rows). */
  fun take(): Inset? {
    if (!pending) return null
    pending = false
    return latest
  }

  /** Rows that carried `carried` are applying: it applies with them unless a newer one came since. */
  fun withRows(carried: Inset?): Inset? = carried?.takeIf { it == latest }

  fun markApplied(inset: Inset) {
    applied = inset
  }
}

/**
 * Measures and lays out a list now, with the adapter changes it has. With
 * fixed size, RecyclerView posts adapter changes to the next frame instead
 * of asking for layout, so a plain measure and layout here would do nothing
 * and the change would land a frame later, after the list has cleared what
 * its animator needs: arrivals then just appeared.
 */
fun RecyclerView.layoutInPlace(width: Int, height: Int) {
  forceLayout()
  measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY))
  layout(0, 0, width, height)
}
