package chat.vera.messagelist

import kotlin.math.abs

/** What a tap's release does (see `Taps`). */
sealed class TapAction {
  /** Report the press now. */
  data class Press(val target: Target) : TapAction()

  /** Report the press once a second tap can no longer come (`Taps.windowMs`). */
  data class PressLater(val target: Target) : TapAction()

  /** The second of a double tap: hold what's under it (the menu). */
  object Hold : TapAction()

  object None : TapAction()
}

/**
 * Taps and double taps on the list, by what they land on, with the React
 * Native list's timing. The touch handler (`MessageListView.Touch`) owns the
 * hold timer, the press shrink, and whether a touch is still a tap.
 *
 * - A message waits `windowMs` after its release: a second tap close by in
 *   that time holds it instead (the menu).
 * - A photo or video opens on its first release, as the React Native list's
 *   did. It's never the second of a double tap, so a quick second tap on it
 *   never opens its menu. Every release on it is a press: JavaScript's
 *   shared guard keeps rapid presses from opening the viewer twice. Holding
 *   it still opens the menu (the hold timer, not here).
 * - Everything else (links, mentions, files, cards, quotes, replies, the
 *   author, reactions) fires on the first release. A second tap on a
 *   reaction is another tap on it.
 */
class Taps(private val windowMs: Long, private val slop: Float) {
  /** A message's press waiting to see if a second tap comes. */
  private var pending: Target? = null
  private var lastUp = 0L
  private var lastX = 0f
  private var lastY = 0f

  /** The touch going on is the second of a double tap. */
  var second = false
    private set

  /**
   * A touch went down on `press`. Returns whether it ended a waiting press
   * (the caller cancels that press): it came close enough, soon enough. On a
   * photo or video it's a tap of its own, so the waiting press is dropped,
   * not turned into a hold.
   */
  fun down(time: Long, x: Float, y: Float, press: Target?): Boolean {
    val close = pending != null && time - lastUp <= windowMs && abs(x - lastX) < slop * 2 && abs(y - lastY) < slop * 2
    if (close) pending = null
    second = close && press?.type != "media"
    return close
  }

  /** A touch that stayed a tap was released on `press`; `onMessage` if it's over a message. */
  fun release(time: Long, x: Float, y: Float, press: Target?, onMessage: Boolean): TapAction {
    if (second) {
      second = false
      // Judged where it's released, not only where it went down: a second
      // tap on a reaction is another tap on it, and one that ends on a photo
      // or video opens it. Neither is the menu.
      if (press?.type != "reaction" && press?.type != "media") return if (onMessage) TapAction.Hold else TapAction.None
    }
    val target = press ?: return TapAction.None
    if (target.immediate) return TapAction.Press(target)
    lastUp = time
    lastX = x
    lastY = y
    pending = target
    return TapAction.PressLater(target)
  }

  /** The waiting press went out. */
  fun fired() {
    pending = null
  }
}
