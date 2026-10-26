package chat.vera.messagelist

/** Opt-in diagnostic only. Sample once at DOWN; never collect message content. */
internal class KeyboardDragTrace(
  private val enabled: () -> Boolean,
  private val write: (String) -> Unit,
) {
  var active = false
    private set
  private var gesture = 0L
  private var moved = false

  fun down(downTime: Long, state: () -> String) {
    active = enabled()
    gesture = downTime
    moved = false
    event("DOWN", state)
  }

  fun firstMove(state: () -> String) {
    if (!active || moved) return
    moved = true
    event("MOVE:first", state)
  }

  fun event(name: String, state: () -> String) {
    if (active) write("gesture=$gesture $name ${state()}")
  }

  fun end(name: String, state: () -> String) {
    event(name, state)
    active = false
  }
}
