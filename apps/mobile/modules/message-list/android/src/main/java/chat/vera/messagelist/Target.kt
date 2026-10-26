package chat.vera.messagelist

import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.text.Spanned

/** What a tap on a part of a row reports: a `press` event. */
data class Target(
  val type: String,
  val rowId: String,
  val part: String? = null,
  val index: Int? = null,
  val reactionKey: String? = null,
  val url: String? = null,
  val accountId: String? = null,
  val messageId: String? = null,
) {
  fun event(): Map<String, Any> {
    val out = HashMap<String, Any>()
    out["type"] = "press"
    out["rowId"] = rowId
    // Not `target`: React Native overwrites that on every event with the view's tag.
    out["element"] = type
    part?.let { out["part"] = it }
    index?.let { out["index"] = it }
    reactionKey?.let { out["reactionKey"] = it }
    url?.let { out["url"] = it }
    accountId?.let { out["accountId"] = it }
    messageId?.let { out["messageId"] = it }
    return out
  }
}

/**
 * What holding a view lifts into the menu: a `hold` event with its frame.
 * On a reaction, `reactionKey` says which; `part` and `index` stay those of
 * the part it belongs to, so the frame is that part's.
 */
data class HoldTarget(val rowId: String, val part: String?, val index: Int? = null, val reactionKey: String? = null)

var View.pressTarget: Target?
  get() = getTag(R.id.message_list_press) as? Target
  set(value) = setTag(R.id.message_list_press, value)

var View.holdTarget: HoldTarget?
  get() = getTag(R.id.message_list_hold) as? HoldTarget
  set(value) = setTag(R.id.message_list_hold, value)

/** Takes horizontal drags itself, so dragging there doesn't reveal times. */
var View.takesHorizontal: Boolean
  get() = getTag(R.id.message_list_horizontal) == true
  set(value) = setTag(R.id.message_list_horizontal, value)

/** What's under a point in a row, deepest first. */
class Hit(
  val press: Target?,
  val pressView: View?,
  val hold: HoldTarget?,
  val holdView: View?,
  val horizontal: Boolean,
)

/**
 * Finds what's under (x, y), in `root`'s coordinates: the deepest view
 * with a press target (or a link or mention in its text), the deepest
 * with a hold target, and whether a view there takes horizontal drags.
 */
fun hitTest(root: View, x: Float, y: Float): Hit {
  var press: Target? = null
  var pressView: View? = null
  var hold: HoldTarget? = null
  var holdView: View? = null
  var horizontal = false
  fun visit(view: View, lx: Float, ly: Float) {
    if (view.visibility != View.VISIBLE || view.alpha == 0f) return
    if (lx < 0 || ly < 0 || lx > view.width || ly > view.height) return
    view.pressTarget?.let {
      press = it
      pressView = view
    }
    view.holdTarget?.let {
      hold = it
      holdView = view
    }
    if (view.takesHorizontal) horizontal = true
    if (view is TextView) {
      spanTarget(view, lx, ly)?.let {
        press = it
        pressView = view
      }
    }
    if (view is ViewGroup) {
      for (index in view.childCount - 1 downTo 0) {
        val child = view.getChildAt(index)
        val cx = lx - child.left - child.translationX + view.scrollX
        val cy = ly - child.top - child.translationY + view.scrollY
        if (cx >= 0 && cy >= 0 && cx <= child.width && cy <= child.height) {
          // A carousel spans the row; beside its cards (over the avatar)
          // the touch is on what's under it.
          if (child is CarouselView && !child.hasCardAt(cx, cy)) continue
          if (child is TapbacksView && !child.hasTapbackAt(cx, cy)) continue
          visit(child, cx, cy)
          break
        }
      }
    }
  }
  visit(root, x, y)
  return Hit(press, pressView, hold, holdView, horizontal)
}

private fun spanTarget(view: TextView, x: Float, y: Float): Target? {
  val text = view.text as? Spanned ?: return null
  val layout = view.layout ?: return null
  val lx = x - view.totalPaddingLeft + view.scrollX
  val ly = y - view.totalPaddingTop + view.scrollY
  if (ly < 0 || ly > layout.height) return null
  val line = layout.getLineForVertical(ly.toInt())
  if (lx < layout.getLineLeft(line) || lx > layout.getLineRight(line)) return null
  val offset = layout.getOffsetForHorizontal(line, lx)
  val spans = text.getSpans(offset, offset, TargetSpan::class.java)
  for (span in spans) {
    val start = text.getSpanStart(span)
    val end = text.getSpanEnd(span)
    // A tap just past a link's end isn't on it.
    if (offset in start until end || (offset == end && end > start && offset == text.length)) {
      return span.target
    }
  }
  return null
}
