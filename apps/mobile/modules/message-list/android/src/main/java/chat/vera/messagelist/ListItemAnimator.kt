package chat.vera.messagelist

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.graphics.Rect
import androidx.recyclerview.widget.RecyclerView
import androidx.recyclerview.widget.SimpleItemAnimator

/**
 * How rows move when the list changes, in one pass on the main thread:
 *
 * - A message that arrives at the bottom (`arrivals`) rises a little and
 *   fades in over `fadeMs` while the rows above make room over `moveMs`.
 * - Other new rows (who's typing) fade in where they belong; removed rows
 *   fade out as the rest close up.
 * - A row that changes in place (a reaction) keeps its still edge where it
 *   was, and the space opens or closes smoothly (see `MessageCell.growsAtTop`).
 * - With `animate` off (a firehose of arrivals, a page of older messages, a
 *   big change), everything takes its place at once.
 *
 * Rows only ever slide vertically, by `translationY`, so nothing is laid out
 * again while they move.
 */
class ListItemAnimator(private val units: Units) : SimpleItemAnimator() {
  var moveMs = 420L
  var fadeMs = 400L

  /** Whether the coming layout pass animates at all. */
  var animate = true

  /** A row's alpha at rest: 0 while it's lifted into the menu. */
  var restingAlpha: (RecyclerView.ViewHolder) -> Float = { 1f }

  /**
   * Whether a changed row keeps its bottom still (its room opened or
   * closed at the top: tapbacks) rather than its top (see
   * `MessageCell.growsAtTop`).
   */
  var growsAtTop: (RecyclerView.ViewHolder) -> Boolean = { (it.itemView as? MessageCell)?.growsAtTop == true }

  /**
   * Rows inserted by the coming pass, and those of them new at the bottom
   * (an arrival, the header over it), which rise together from below with
   * the rows above them, as on iOS.
   */
  var inserted: Set<String> = emptySet()
  var rising: Set<String> = emptySet()

  /** A message growing out of the typing bubble it replaces (see `MessageCell.growFromTyping`). */
  var handoff: String? = null

  private class Pending(val holder: RecyclerView.ViewHolder, val kind: Int, val clip: Boolean)

  private val pending = ArrayList<Pending>()
  private val running = HashMap<RecyclerView.ViewHolder, Animator>()

  init {
    supportsChangeAnimations = true
  }

  private fun rowId(holder: RecyclerView.ViewHolder) = (holder as? RowHolder)?.row?.id

  override fun canReuseUpdatedViewHolder(viewHolder: RecyclerView.ViewHolder, payloads: MutableList<Any>) = true

  override fun canReuseUpdatedViewHolder(viewHolder: RecyclerView.ViewHolder) = true

  override fun animateRemove(holder: RecyclerView.ViewHolder): Boolean {
    endAnimation(holder)
    // The message that replaces the typing bubble grows out of it: the bubble just goes.
    if (!animate || (handoff != null && holder.itemView is TypingCell)) {
      dispatchRemoveFinished(holder)
      return false
    }
    pending.add(Pending(holder, REMOVE, false))
    return true
  }

  override fun animateAdd(holder: RecyclerView.ViewHolder): Boolean {
    endAnimation(holder)
    val id = rowId(holder)
    val view = holder.itemView
    if (animate && id != null && id == handoff) {
      (view as? MessageCell)?.growFromTyping(GROW_MS)
      dispatchAddFinished(holder)
      return false
    }
    if (!animate || id == null || id !in inserted) {
      dispatchAddFinished(holder)
      return false
    }
    view.alpha = 0f
    val kind = when {
      view is TypingCell -> ADD_TYPING
      id in rising -> ADD_RISING
      else -> ADD
    }
    pending.add(Pending(holder, kind, false))
    return true
  }

  override fun animateMove(holder: RecyclerView.ViewHolder, fromX: Int, fromY: Int, toX: Int, toY: Int): Boolean =
    move(holder, fromY, toY, clip = false, change = false)

  private fun move(holder: RecyclerView.ViewHolder, fromY: Int, toY: Int, clip: Boolean, change: Boolean): Boolean {
    val view = holder.itemView
    val from = fromY + view.translationY.toInt()
    endAnimation(holder)
    val delta = from - toY
    if (delta == 0 || !animate) {
      view.translationY = 0f
      if (change) dispatchChangeFinished(holder, true) else dispatchMoveFinished(holder)
      return false
    }
    view.translationY = delta.toFloat()
    pending.add(Pending(holder, if (change) CHANGE else MOVE, clip && delta > 0))
    return true
  }

  override fun animateChange(
    oldHolder: RecyclerView.ViewHolder,
    newHolder: RecyclerView.ViewHolder,
    preLayoutInfo: ItemHolderInfo,
    postLayoutInfo: ItemHolderInfo,
  ): Boolean {
    if (oldHolder !== newHolder) {
      dispatchChangeFinished(oldHolder, true)
      dispatchChangeFinished(newHolder, false)
      return false
    }
    // The edge that stays: the bottom when the row grows at its top
    // (tapbacks), else the top, so what's under it opens below.
    return if (growsAtTop(newHolder)) {
      move(newHolder, preLayoutInfo.bottom, postLayoutInfo.bottom, clip = false, change = true)
    } else {
      move(newHolder, preLayoutInfo.top, postLayoutInfo.top, clip = true, change = true)
    }
  }

  override fun animateChange(
    oldHolder: RecyclerView.ViewHolder,
    newHolder: RecyclerView.ViewHolder?,
    fromLeft: Int,
    fromTop: Int,
    toLeft: Int,
    toTop: Int,
  ): Boolean {
    if (newHolder == null || oldHolder === newHolder) return move(oldHolder, fromTop, toTop, clip = true, change = true)
    dispatchChangeFinished(oldHolder, true)
    dispatchChangeFinished(newHolder, false)
    return false
  }

  override fun runPendingAnimations() {
    val batch = ArrayList(pending)
    pending.clear()
    // Everything new at the bottom rises by its height together, so it
    // moves as one with the rows above making room for it.
    val rise = batch.filter { it.kind == ADD_RISING }.sumOf { it.holder.itemView.height }
    for (item in batch) if (item.kind == ADD_RISING) item.holder.itemView.translationY = rise.toFloat()
    for (item in batch) start(item)
  }

  private fun start(item: Pending) {
    val holder = item.holder
    val view = holder.itemView
    val startY = view.translationY
    val startAlpha = view.alpha
    val animator = ValueAnimator.ofFloat(0f, 1f)
    // Each part keeps its own time: moves over `moveMs`, fades over
    // `fadeMs`, all on the list's curve, from one clock.
    animator.interpolator = android.view.animation.LinearInterpolator()
    animator.duration = when (item.kind) {
      ADD -> fadeMs
      ADD_RISING -> maxOf(moveMs, fadeMs)
      ADD_TYPING -> TYPING_DELAY_MS + TYPING_IN_MS
      REMOVE -> if (view is TypingCell) moveMs else REMOVE_MS
      else -> moveMs
    }
    fun eased(ms: Long, delay: Long = 0): Float {
      val t = ((animator.currentPlayTime - delay).toFloat() / ms).coerceIn(0f, 1f)
      return EASE.getInterpolation(t)
    }
    val clip = Rect()
    if (item.kind == ADD_TYPING) {
      // From its bubble's corner, as on iOS.
      view.pivotX = units.pxf(16f)
      view.pivotY = view.height.toFloat()
      view.scaleX = 0.75f
      view.scaleY = 0.75f
    }
    animator.addUpdateListener {
      when (item.kind) {
        ADD -> view.alpha = eased(fadeMs)
        ADD_RISING -> {
          view.translationY = startY * (1f - eased(moveMs))
          view.alpha = eased(fadeMs)
        }
        ADD_TYPING -> {
          val t = eased(TYPING_IN_MS, TYPING_DELAY_MS)
          view.alpha = t
          view.scaleX = 0.75f + 0.25f * t
          view.scaleY = view.scaleX
        }
        REMOVE -> {
          if (view is TypingCell) {
            // Who's typing sinks away by its height as it fades.
            val t = EASE_OUT.getInterpolation((animator.currentPlayTime.toFloat() / moveMs).coerceIn(0f, 1f))
            view.alpha = startAlpha * (1f - t)
            view.translationY = startY + view.height * t
          } else {
            view.alpha = startAlpha * (1f - eased(REMOVE_MS))
          }
        }
        else -> {
          view.translationY = startY * (1f - eased(moveMs))
          if (item.clip) {
            // What's under the row's content shows only as its space opens.
            clip.set(-view.width, -view.height, view.width * 2, view.height - view.translationY.toInt())
            view.clipBounds = clip
          }
        }
      }
    }
    animator.addListener(object : AnimatorListenerAdapter() {
      private var done = false

      override fun onAnimationStart(animation: Animator) {
        when (item.kind) {
          ADD, ADD_RISING, ADD_TYPING -> dispatchAddStarting(holder)
          REMOVE -> dispatchRemoveStarting(holder)
          CHANGE -> dispatchChangeStarting(holder, true)
          else -> dispatchMoveStarting(holder)
        }
      }

      override fun onAnimationCancel(animation: Animator) = finish()

      override fun onAnimationEnd(animation: Animator) = finish()

      private fun finish() {
        if (done) return
        done = true
        running.remove(holder)
        view.translationY = 0f
        view.scaleX = 1f
        view.scaleY = 1f
        view.clipBounds = null
        when (item.kind) {
          ADD, ADD_RISING, ADD_TYPING -> {
            view.alpha = restingAlpha(holder)
            dispatchAddFinished(holder)
          }
          REMOVE -> {
            view.alpha = 1f
            dispatchRemoveFinished(holder)
          }
          CHANGE -> dispatchChangeFinished(holder, true)
          else -> dispatchMoveFinished(holder)
        }
        if (!isRunning) dispatchAnimationsFinished()
      }
    })
    running[holder] = animator
    animator.start()
  }

  override fun endAnimation(item: RecyclerView.ViewHolder) {
    running[item]?.cancel()
    val index = pending.indexOfFirst { it.holder === item }
    if (index >= 0) {
      val entry = pending.removeAt(index)
      finishNow(entry)
    }
  }

  private fun finishNow(entry: Pending) {
    val view = entry.holder.itemView
    view.translationY = 0f
    view.scaleX = 1f
    view.scaleY = 1f
    view.clipBounds = null
    when (entry.kind) {
      ADD, ADD_RISING, ADD_TYPING -> {
        view.alpha = restingAlpha(entry.holder)
        dispatchAddFinished(entry.holder)
      }
      REMOVE -> {
        view.alpha = 1f
        dispatchRemoveFinished(entry.holder)
      }
      CHANGE -> dispatchChangeFinished(entry.holder, true)
      else -> dispatchMoveFinished(entry.holder)
    }
  }

  override fun endAnimations() {
    val batch = ArrayList(pending)
    pending.clear()
    for (entry in batch) finishNow(entry)
    for (animator in ArrayList(running.values)) animator.cancel()
    running.clear()
    dispatchAnimationsFinished()
  }

  override fun isRunning() = pending.isNotEmpty() || running.isNotEmpty()

  companion object {
    private const val ADD = 0
    private const val REMOVE = 1
    private const val MOVE = 2
    private const val CHANGE = 3
    private const val ADD_RISING = 4
    private const val ADD_TYPING = 5

    /** iOS's: removed rows fade this fast; who's typing appears after a beat. */
    private const val REMOVE_MS = 180L
    private const val TYPING_DELAY_MS = 105L
    private const val TYPING_IN_MS = 315L

    /** How long a message takes to grow out of the typing bubble. */
    const val GROW_MS = 320L


  }
}
