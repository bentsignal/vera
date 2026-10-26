package chat.vera.messagelist

import android.os.Handler
import android.view.View
import android.view.animation.DecelerateInterpolator
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

/** RN's 0.96 press shrink, delayed so taps and the start of a scroll do not shrink. */
class PressShrink(private val main: Handler) {
  private var pressed: View? = null
  private var pending: Runnable? = null

  fun begin(view: View) {
    release()
    if (view !is BubbleTextView && view !is MediaView && view !is FileCardView && view !is LinkCardView && view !is QuoteView) return
    if (view.parent is DeckView || view.parent is CarouselCard) return
    val work = Runnable {
      pressed = view
      view.animate().scaleX(0.96f).scaleY(0.96f).setDuration(240).setInterpolator(DecelerateInterpolator()).start()
    }
    pending = work
    main.postDelayed(work, 80)
  }

  /** A reaction: pressed at once and a little further, since its tap fires on release. */
  fun pressNow(view: View) {
    release()
    pressed = view
    view.animate().scaleX(0.9f).scaleY(0.9f).setDuration(90).setInterpolator(DecelerateInterpolator()).start()
  }

  fun release() {
    pending?.let { main.removeCallbacks(it) }
    pending = null
    pressed?.let { view ->
      // RN's release spring: mass 1, stiffness 320, damping 14.
      view.animate().scaleX(1f).scaleY(1f).setDuration(650).setInterpolator { fraction ->
        val t = fraction * 0.65
        val w = sqrt(320.0 - 7.0 * 7.0)
        if (fraction == 1f) 1f else (1 - exp(-7 * t) * (cos(w * t) + 7 / w * sin(w * t))).toFloat()
      }.start()
    }
    pressed = null
  }
}
