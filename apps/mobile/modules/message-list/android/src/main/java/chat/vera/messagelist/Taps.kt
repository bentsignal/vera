package chat.vera.messagelist

/**
 * One touch's eligibility, with no arbitration between successive taps.
 * Every valid release presses its current target immediately. Only the
 * touch handler's long-press timer can consume the touch as a hold.
 */
internal class Taps {
  var isTap = false
    private set

  fun begin(stoppedScroll: Boolean) {
    isTap = !stoppedScroll
  }

  fun cancel() {
    isTap = false
  }

  fun takeHold(): Boolean {
    val held = isTap
    isTap = false
    return held
  }

  fun release(target: Target?): Target? {
    val pressed = if (isTap) target else null
    isTap = false
    return pressed
  }
}
